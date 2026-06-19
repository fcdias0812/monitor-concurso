# Monitor de Editais de Convocação — Indaiatuba

Monitora o portal de [editais de convocação de Indaiatuba](https://www.indaiatuba.sp.gov.br/administracao/rh/editais-de-convocacao/),
analisa cada PDF e procura por um **nome** e uma **posição** (classificação) específicos.
Roda uma verificação de hora em hora atrás de editais novos e mostra tudo num painel web.

## Dois modos de uso

| Modo | Comando | Para quê |
|------|---------|----------|
| **Local (ao vivo)** | `npm start` → http://localhost:3000 | rodar na sua máquina; o botão "Verificar agora" faz a checagem na hora |
| **GitHub Pages** | automático (GitHub Actions) | painel público, verificação de hora em hora na nuvem |

### Local

```bash
npm install      # uma vez
npm start        # sobe o painel em http://localhost:3000
```

Ao iniciar, o programa:

1. Busca a lista de editais no portal.
2. Cadastra os novos no banco SQLite (`data/editais.db`).
3. Baixa e analisa cada PDF/RTF ainda não processado (cache em `data/pdfs/`).
4. Agenda uma nova verificação **de hora em hora** (cron `0 * * * *`).

No painel você vê: total de editais, analisados, **quantos deram match**, erros,
a lista paginada (10/página, com busca; clique num item para ver os candidatos e o documento original).

> O agendamento local só roda enquanto o `npm start` estiver aberto.

## Deploy no GitHub Pages

Como o GitHub Pages só serve arquivos estáticos, o monitoramento roda no
**GitHub Actions** (de hora em hora) e publica um `data.json` que o painel lê.

**Passo único de configuração** (depois é automático):

1. Suba o projeto para um repositório no GitHub (`git push`).
2. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Pronto. O workflow [`.github/workflows/monitor.yml`](.github/workflows/monitor.yml) roda:
   - na primeira `push`,
   - de hora em hora (cron),
   - e quando você clicar **Run workflow** na aba **Actions**.

O painel fica em `https://<seu-usuario>.github.io/<repositorio>/`.

Para pré-visualizar localmente como ficará no Pages:

```bash
npm run build    # gera a pasta docs/ (data.json + index.html)
npm run preview  # serve docs/ em http://localhost:3001
```

> O estado entre execuções na nuvem é guardado em cache (banco SQLite), então
> cada rodada só baixa e analisa os editais **novos**.
> Obs.: o GitHub desativa workflows agendados após ~60 dias sem atividade no repo —
> basta um commit (ou um "Run workflow") para reativar.

## Configuração — `config.json`

```json
{
  "target": { "name": "Fabrício Cauã de Oliveira Dias", "position": "419" },
  "years": ["2026", "2025"],
  "checkCron": "0 * * * *",
  "port": 3000
}
```

- **target.name** — busca tolerante a acentos, maiúsculas/minúsculas e pontuação.
- **target.position** — a classificação procurada (ex.: `419º` no PDF).
- **years** — anos monitorados. O portal lista editais desde 2013 (713 no total);
  como o concurso de interesse é o **nº 1/2025**, o padrão analisa só **2025 e 2026**.
  Deixe a lista **vazia** (`"years": []`) para analisar **todos** os anos.
- **checkCron** — frequência da verificação (padrão: de hora em hora).

Alterou o `config.json`? Reinicie o `npm start`.

## Como a busca funciona

Cada PDF é convertido em texto. A lista de candidatos
(`89º FULANO, 90º BELTRANO, ...`) é extraída e:

- **Nome**: comparado de forma normalizada (sem acento, caixa unificada) contra todo o texto.
- **Posição**: procura a classificação alvo (ex.: `419`) e mostra o nome associado a ela,
  para você conferir se é a pessoa certa.

Um edital é destacado se **o nome OU a posição** forem encontrados.

## Estrutura

```
config.json                      # alvo, anos, agendamento, porta
src/
  server.js                      # Express + agendamento (modo local)
  monitor.js                     # orquestra: busca lista, cadastra, analisa
  scraper.js                     # baixa e parseia a página do portal (ISO-8859-1)
  pdf.js                         # baixa e extrai texto de PDF e RTF
  matcher.js                     # normalização + parser de candidatos + busca
  db.js                          # SQLite (better-sqlite3)
  build-static.js                # gera docs/ (data.json + painel) p/ o Pages
  serve-docs.js                  # serve docs/ localmente (preview do Pages)
public/index.html                # painel (responsivo + paginado)
.github/workflows/monitor.yml    # GitHub Actions: monitora e publica de hora em hora
docs/                            # build do Pages (gerado; data.json + index.html)
data/                            # banco e PDFs em cache (gerado em runtime)
```

O painel (`public/index.html`) funciona nos dois modos: tenta ler `./data.json`
(GitHub Pages) e, se não houver, cai para a API local (`/api/...`) do `npm start`.
