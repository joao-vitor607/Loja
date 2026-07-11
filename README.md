# Loja de Marcenaria — Nível Empresarial

## Estrutura

```
index.html      → tela de redirecionamento (link "capa")
loja.html        → loja pública (link para o cliente)
admin.html       → painel administrativo (link separado, protegido por login)
js/db.js         → TODA a lógica de dados do sistema (ver abaixo)
sql/schema.sql    → schema MySQL pronto para quando você migrar
manifest.json / sw.js → deixam a loja instalável como app (PWA) e funcionando offline
```

Como pedido: **o link da loja e o link do admin são separados**. Você distribui
`loja.html` para os clientes e guarda `admin.html` só para você. O acesso ao
admin pela loja continua existindo como atalho escondido (clicar 7x no logo
ou `Ctrl+Shift+A`), mas o normal é acessar `admin.html` direto.

## Login padrão do admin

- Usuário: `ferrera`
- Senha: `123`

**Troque a senha assim que possível** em Configurações → Segurança da Conta.
Agora a senha fica salva com hash (SHA-256 + salt), nunca em texto puro, e o
login bloqueia por 60s após 5 tentativas erradas.

## O que mudou (nível empresarial)

1. **Camada de dados única (`js/db.js`)** — antes cada página mexia direto no
   `localStorage`. Agora tudo passa por `DB.Products`, `DB.Orders`, `DB.Auth`
   etc. Isso deixa o código organizado e principalmente **pronto pra trocar
   para MySQL sem reescrever a loja/admin** — só troca o "motor" dentro do
   `db.js`.

2. **Segurança do login** — senha com hash, bloqueio por tentativas, sessão
   expira em 2h automaticamente.

3. **Campos de marcenaria nos produtos** — material (MDF, madeira maciça...),
   dimensões, se é sob encomenda e prazo de produção em dias, e estoque
   (opcional, pra quem tem peças de pronta entrega).

4. **Pedidos com fluxo de status real**: Aguardando confirmação → Confirmado
   → Em produção → Pronto → Entregue (ou Cancelado). Cada pedido ganha um
   código tipo `MRC-2026-0001`.

5. **Rastreamento de pedido pro cliente** — botão "📦 Meu Pedido" na loja,
   ele digita o código + telefone e vê o andamento, sem precisar falar com
   você pra saber o status.

6. **Backup e exportação** (Configurações → Backup) — baixar backup completo
   em JSON, importar de volta, e exportar pedidos em CSV pra abrir no Excel.

7. **Busca e filtro de categoria** na loja.

8. **Dashboard com dado real** — antes tinha "↑12% este mês" fixo no código
   (mentira). Agora mostra receita real dos últimos 7 dias.

## Migrando pra MySQL depois

Quando for trocar, o único arquivo que precisa mudar de verdade é o
`js/db.js`: cada função hoje lê/escreve no `localStorage` através do objeto
`engine` no topo do arquivo. Troque esse `engine` por chamadas `fetch()` para
uma API Node.js + Express que você já sabe construir (você já fez isso nos
bots com `mysql2`). O `sql/schema.sql` já tem as tabelas com os mesmos nomes
de campo usados no `db.js`, então o mapeamento é direto — produto por
produto, pedido por pedido.

Sugestão de rotas pra API quando for construir:

```
GET    /api/products
POST   /api/products
DELETE /api/products/:id
GET    /api/orders
POST   /api/orders
PATCH  /api/orders/:id/status
POST   /api/auth/login
...
```

## Rodando localmente

Não precisa de servidor — são arquivos estáticos. Só abra `loja.html` (ou
`index.html`) no navegador. Se quiser testar com um servidor local (recomendado
para o Service Worker funcionar):

```bash
python3 -m http.server 8000
# depois acesse http://localhost:8000/index.html
```
