# Relatório de baixa de OF

## Configurar o Supabase

1. Crie ou abra seu projeto no [Supabase](https://supabase.com/dashboard).
2. No painel do projeto, abra **SQL Editor**, crie uma consulta, cole o conteúdo
   de `supabase/schema.sql` e clique em **Run**. Isso cria as tabelas do histórico,
   as funções e o bucket privado `relatorios-pdfs` no Supabase Storage.
   Se as tabelas já existem, execute
   `supabase/migrate-pdf-storage-to-supabase.sql` no SQL Editor para configurar
   o bucket. Se a função `register_print` informar que a sequência não foi
   inicializada, execute também `supabase/migrate-repair-print-sequence.sql`.
3. Em **Project Settings > API Keys**, copie a **Project URL**, a **Publishable
   key** e a **Secret key**.
4. No painel da Vercel, abra o projeto em **Settings > Environment Variables** e
   cadastre estas variáveis para **Production** (e Preview, se usar):

   ```text
   SUPABASE_URL=https://SEU-PROJETO.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua-chave
   SUPABASE_SECRET_KEY=sb_secret_sua-chave
   ```

   A **Secret key** só é usada pelas funções no servidor. Nunca a coloque no
   HTML, não a envie pelo chat e não a cadastre com prefixo `NEXT_PUBLIC_`. A
   Publishable key é disponibilizada à página para enviar arquivos usando uma
   URL assinada; ela não substitui nem expõe a chave secreta.
   Para projetos que ainda só tenham chaves legadas, use
   `SUPABASE_SERVICE_ROLE_KEY` no lugar de `SUPABASE_SECRET_KEY`.

O bucket é privado e aceita apenas PDFs de até 50 MB. O servidor autoriza cada
envio no Supabase e gera uma URL assinada de uso único para a identificação
pendente. Os PDFs permanecem no Supabase Storage; não é necessário conectar
outro provedor de armazenamento.

Para desenvolvimento local, copie `.env.example` para `.env` e preencha as três
variáveis do Supabase. PDFs arquivados anteriormente em outro armazenamento
não são copiados automaticamente.

## Publicar na Vercel

Importe o repositório pela Vercel ou use a CLI a partir desta pasta. O servidor
`preview-server.js` é apenas para uso local; mantenha-o fora do nome reservado
`server.js`, que a Vercel interpreta como função de entrada. Na Vercel, as
funções da pasta `api/` são executadas sob demanda e o HTML/CSS são servidos
como arquivos estáticos. Não é necessário manter `iniciar_servidor.bat` aberto.
O `vercel.json` define o framework como **Other**, pois este projeto não usa um
servidor Node de entrada. Depois de cadastrar/alterar as variáveis, faça um novo
deploy.

O `npm start` e os arquivos `.bat` continuam disponíveis para testes locais;
copie `.env.example` para `.env` e preencha as mesmas variáveis para usá-los.

## Identificações e histórico

Cada clique em **Salvar PDF** registra a OF e os itens no banco, gera o PDF com
a identificação no navegador e envia o arquivo ao bucket privado do Supabase
Storage. Só depois o sistema abre a janela de impressão. O banco Supabase guarda
o caminho (`relatorios/identificação.pdf`), a data/hora do arquivamento e os
dados da impressão. Consulte os metadados em **Supabase > Table Editor >
print_records** e os PDFs em **Supabase > Storage > relatorios-pdfs**.
Na planilha, inclua uma coluna de custo unitário com cabeçalho `Custo`,
`Custo Unitário` ou `Valor Unitário`; o relatório calcula a coluna **Total**
multiplicando quantidade pelo custo.
As linhas com o mesmo código e o mesmo depósito são agrupadas, mesmo quando os
lotes são diferentes: as quantidades e os totais são somados, e o custo unitário
é recalculado como média ponderada. O mesmo código em depósitos diferentes
permanece separado. A coluna de lote não é exibida nem exigida na planilha.
O identificador global começa em `01`; cancelar a impressão após o arquivamento
não devolve o número.

As tabelas `print_records` e `print_sequence` têm RLS habilitado. As funções SQL
de registro só podem ser executadas pela chave privilegiada do servidor. O bucket
é privado; a página recebe uma URL assinada, nunca a chave privilegiada do projeto.

**Atenção:** a opção atual não exige login. Qualquer pessoa que acessar o endereço
público da Vercel poderá registrar relatórios e ocupar o armazenamento. Para uso
restrito à empresa, proteja o acesso antes de divulgar o endereço.

## Testes

Execute `npm test` (ou `npm.cmd test` no PowerShell) para testar as rotas e o
formato da integração com o Supabase usando um servidor simulado local.
