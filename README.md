# Grafinorte — Sistema de Tarefas

Ferramenta interna de planejamento de tarefas (estilo Kanban) para a Grafinorte. Usuários fazem login, criam tarefas, atribuem a colegas e movem os cards entre colunas de status. Roda na rede local da empresa, sem precisar de internet.

## Primeira instalação (uma vez só)

Pré-requisito: [Node.js](https://nodejs.org/) instalado no computador que vai funcionar como "servidor" (o PC que vai ficar com o sistema rodando).

Dê um duplo-clique em **`preparar-grafinorte.bat`**. Ele instala tudo, cria o banco de dados e o usuário administrador, e gera a versão final — sem precisar digitar nenhum comando. No final, ele mostra "Tudo pronto!".

**Importante**: o administrador padrão é criado com o email/senha definidos em `server/.env` (`server/.env.example` mostra o padrão). Troque essa senha assim que entrar no sistema, na página "Usuários".

Se aparecer um erro dizendo que o Node.js não está instalado, baixe em [nodejs.org](https://nodejs.org/) e rode o `preparar-grafinorte.bat` de novo.

## Uso no dia a dia

No PC que vai servir o sistema para a equipe:

- **Ligar**: duplo-clique em **`iniciar-grafinorte.bat`**. Ele abre o navegador automaticamente. Se o sistema já estiver rodando, só abre o navegador — não dá erro.
- **Parar**: duplo-clique em **`parar-grafinorte.bat`**.

Ao ligar, uma janela preta mostra algo assim:

```
Grafinorte - Sistema de Tarefas rodando!
  Local: http://localhost:4000
  Rede:  http://192.168.x.x:4000   <-- compartilhe este endereço com a equipe
```

Compartilhe o endereço "Rede" com os colegas (ex: favoritar no navegador de cada computador, ou enviar pelo grupo da empresa). Todo mundo na mesma rede Wi-Fi/cabeada acessa pelo navegador, sem instalar nada.

**Não feche essa janela preta** enquanto a equipe estiver usando — é ela que mantém o sistema rodando. Se fechar por engano, é só abrir o `iniciar-grafinorte.bat` de novo.

### Se der algum erro ao iniciar

- **"O sistema já está rodando"**: normal, só significa que já estava ligado — o navegador abre direto.
- **Tela vermelha de erro do Node logo ao abrir**: geralmente é a porta 4000 já ocupada por uma janela antiga que não foi fechada certinho. Rode o `parar-grafinorte.bat` e depois o `iniciar-grafinorte.bat` de novo.
- **Pede para rodar o `preparar-grafinorte.bat`**: o sistema ainda não foi instalado neste computador — é só seguir a instrução na tela.

### Se ninguém de outro computador conseguir acessar

- Confirme que os dois computadores estão na mesma rede.
- O Firewall do Windows pode bloquear a primeira vez — aceite a permissão de rede quando o Windows perguntar (ou libere a porta 4000 manualmente).

## Papéis de usuário

- **Administrador**: cria/edita/desativa usuários, renomeia e reordena colunas do quadro.
- **Membro**: cria, edita, atribui, move e exclui tarefas no quadro compartilhado.

Não existe cadastro público — só um administrador pode criar novos usuários, na página "Usuários".

## Desenvolvimento

```
npm run dev
```

Roda o backend (porta 4000) e o frontend com recarregamento automático (Vite, porta 5173) ao mesmo tempo.

## Estrutura

- `assets/` — logos originais da empresa (fonte única).
- `server/` — API em Node.js + Express + Prisma (SQLite).
- `client/` — interface em React + Vite + Tailwind.

## Próximas fases (não implementadas ainda)

Financeiro, orçamento e RH. A arquitetura atual (banco de dados via Prisma, separação por módulos) foi pensada para crescer nessa direção sem precisar reescrever o que já existe.
