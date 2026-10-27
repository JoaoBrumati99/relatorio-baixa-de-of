# Relatório de baixa de OF

Aplicação React + TypeScript para importar movimentações de Excel/CSV, montar o
relatório de consumo por OF e arquivar o PDF no Supabase Storage.

## Executar

```sh
npm install
npm run dev
```

O modo de desenvolvimento do Vite serve a interface. As rotas de API de
arquivamento ficam em `api/` e são executadas como funções na Vercel; para testar
o fluxo completo localmente, use `vercel dev` com as variáveis de ambiente
configuradas.

## Configuração do Supabase

1. Execute `supabase/schema.sql` no SQL Editor do seu projeto Supabase. Se já
   houver um banco com esse esquema, aplique as migrações em `supabase/` quando
   necessário.
2. Configure estas variáveis no ambiente de execução das funções:

   ```text
   SUPABASE_URL=https://SEU-PROJETO.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua-chave
   SUPABASE_SECRET_KEY=sb_secret_sua-chave
   ```

   `SUPABASE_SECRET_KEY` é usada somente pelas funções do servidor. Nunca a
   coloque no código do navegador. Para projetos que ainda usam chaves legadas,
   use `SUPABASE_SERVICE_ROLE_KEY` no lugar da chave secreta.

Cada impressão gera uma identificação no banco, cria uma URL assinada de uso
único para o PDF e arquiva o arquivo no bucket privado `relatorios-pdfs`. A
interface permite importar `.xlsx`, `.xlsm` e `.csv`; todos os itens da planilha
são incluídos, sem filtrar pelo depósito.

Esta aplicação não inclui autenticação. Proteja o endereço da implantação antes
de divulgá-lo: qualquer pessoa que puder acessá-lo poderá registrar relatórios e
usar o armazenamento configurado.

## Estrutura

```text
api/                         Rotas serverless para registro e arquivamento
src/
  api/                       Comunicação com as rotas e Supabase Storage
  components/                Componentes React e seus estilos
  server/                    Handlers e configuração privada do Supabase
  services/                  Leitura de planilhas e criação de PDF
  types/                     Tipos compartilhados da aplicação
  App.tsx                    Estado e composição da tela
  index.css                  Estilos globais e regras de impressão
supabase/                    Esquema e migrações SQL
```

## Comandos

- `npm run dev`: inicia o Vite.
- `npm run build`: valida os tipos e gera a versão de produção.
- `npm run lint`: executa o Oxlint.
