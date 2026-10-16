# Max Mercado

Site demonstrativo de mercado com catálogo compartilhado, carrinho, formulário de entrega, registro de pedidos, mensagem pronta para WhatsApp e painel do proprietário.

## Antes de publicar
- O WhatsApp configurado é `5516993702260` (16 99370-2260). Confirme que é o número correto do mercado.
- Os produtos e preços são exemplos. Atualize-os no painel antes de usar.
- O cliente registra o pedido no banco e depois precisa tocar em **Enviar** no WhatsApp para encaminhar a mensagem. O site não envia mensagens automaticamente.
- Configure um banco PostgreSQL persistente. Não use armazenamento local temporário para guardar pedidos.
- Use uma senha forte em `ADMIN_PASSWORD`. Não coloque senha no código.
- Este é um projeto inicial/demonstrativo; antes de uso comercial, revise privacidade, proteção contra abuso, política de entrega e segurança.

## Rodar localmente
Requer Node.js 18+ e PostgreSQL.
1. Crie um banco PostgreSQL.
2. Configure as variáveis `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET` e `WHATSAPP_NUMBER`.
3. Execute `npm install` e `npm start`.
4. Abra `http://localhost:3000`.

## Publicar no Render
1. Envie estes arquivos para um repositório GitHub.
2. No Render, crie um banco PostgreSQL e copie a URL de conexão interna apropriada para o serviço.
3. Crie um Web Service conectado ao repositório, com `npm install` como build command e `npm start` como start command.
4. Configure as variáveis `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET` e `WHATSAPP_NUMBER` nas configurações do serviço.
5. Depois do deploy, teste catálogo, pedido e painel administrativo.
6. O plano gratuito e as condições de bancos de dados podem mudar; confira os preços/limites atuais do Render antes de depender do serviço.

## Recursos
- Produtos iniciais inseridos automaticamente quando o banco está vazio.
- Produtos podem ser adicionados e ativados/desativados no painel.
- Pedidos são recalculados no servidor usando os preços atuais do banco.
- O painel mostra até 100 pedidos recentes e permite alterar o status.
- A autenticação administrativa usa um token em memória; ao reiniciar o serviço, o administrador pode precisar entrar novamente.
