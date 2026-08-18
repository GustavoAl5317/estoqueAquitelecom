# Estoque — Plataforma Operacional

Controle e rastreabilidade de materiais e ativos para provedor de internet.
A qualquer momento o sistema responde: **onde está, com quem está, quando saiu,
por que saiu, quanto foi usado, foi devolvido, qual o estado atual, quanto ainda
temos e quando será preciso comprar de novo.**

Aplicação web única, responsiva, sem aplicativo mobile separado.

---

## Instalação

Requer Node.js 20 ou superior.

```bash
git clone https://github.com/GustavoAl5317/estoqueAquitelecom.git
cd estoqueAquitelecom
npm install
```

Configure o ambiente:

```bash
cp .env.example .env
```

Crie o banco e popule com dados de demonstração:

```bash
npx prisma migrate deploy
npm run db:seed
```

Suba o servidor:

```bash
npm run dev
```

A aplicação abre em `http://localhost:3000`.

> ⚠️ **Os dados do seed são fictícios.** Existem para as telas terem o que
> mostrar durante a avaliação — nenhum material, técnico ou OS ali corresponde à
> operação real.
>
> Para entrar em produção, use **`npm run db:limpar`**, que apaga tudo e **não**
> repopula. (`npm run db:reset` limpa e roda o seed de novo — serve para voltar
> à demonstração, não para começar de verdade.)

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Roda o build de produção |
| `npm run db:seed` | Popula a base com ~90 dias de operação fictícia |
| `npm run db:limpar` | Apaga tudo e deixa o banco **vazio** — é o começo da produção |
| `npm run db:reset` | Apaga tudo e repopula com o seed fictício |
| `npm run db:studio` | Abre o Prisma Studio para inspecionar a base |
| `npm run db:check` | Confere se os saldos batem com o razão de movimentos |
| `npm run traccar -- --verificar` | Testa a conexão com o rastreamento |
| `npm run sgp -- --path api/...` | Sonda a API do SGP |

---

## Como o sistema está organizado

### Detentor: a abstração central

Material pode estar com um **estoque físico**, com um **técnico** ou com uma
**equipe**. Os três são `Detentor`. Por isso qualquer transferência —
estoque→técnico, técnico→técnico, equipe→estoque — é a mesma operação, com o
mesmo código e a mesma auditoria.

### O razão de movimentos é imutável

Toda operação grava uma linha em `Movimento`, que nunca é alterada nem apagada.
O saldo é consequência do razão, e `npm run db:check` verifica essa igualdade.
É o que permite a timeline completa de cada item (1.23) e a auditoria (1.24).

### Nada entra sem conferência

Uma entrada nasce em `AGUARDANDO_RECEBIMENTO`. O material só passa a contar como
disponível depois da conferência física. Divergência entre o previsto e o
recebido exige motivo e fica registrada para sempre.

### Logística reversa não devolve nada direto ao estoque

Equipamento devolvido em estado diferente de novo, ou vindo de cliente, vai para
uma área de **triagem**. Só sai de lá com laudo, para um de três destinos:
estoque disponível, manutenção ou descarte. Cada passo é uma movimentação
rastreável — nunca uma exclusão.

---

## Estrutura

```
prisma/
  schema.prisma        modelo de dados dos quatro blocos
  seed.ts              operação fictícia de ~90 dias
  verificar.ts         conferência saldo × razão

scripts/
  traccar.ts           coletor de posições da frota
  sgp-explorar.ts      sonda da API do SGP

src/
  app/                 rotas (App Router) e server actions em app/acoes/
  components/          design system e formulários
  lib/
    dominio.ts         domínios fechados — fonte única de verdade
    servicos/          regras de negócio
      nucleo.ts        saldos, auditoria, numeração — o coração
      movimentacoes.ts motor único de saída/transferência/devolução/baixa
      entradas.ts      entrada, recebimento e divergência
      triagem.ts       logística reversa
      consultas.ts     leitura para telas e relatórios
      analise.ts       previsão de consumo e detecção de anomalias
      ordens.ts        ciclo de vida da OS, SLA e quadro
      regioes.ts       bairros, responsáveis e cobertura
      roteiro.ts       ordem de visita por proximidade e urgência
      fila.ts          recomendação de técnico por OS (Bloco 4)
      frota.ts         veículos, vínculo com técnico e posição
      traccar.ts       conector da plataforma de rastreamento
```

### A OS é a unidade de trabalho, não o cadastro do cliente

Da ordem de serviço guardamos o que a operação precisa para decidir: número,
cliente, endereço, prioridade e prazo. O cadastro completo continua no SGP. Isso
mantém o sistema útil mesmo quando a integração está fora do ar — e evita manter
duas verdades sobre o mesmo cliente.

O quadro (`/os/quadro`) permite mover a OS pelo fluxo arrastando o cartão. As
transições são livres de propósito: campo raramente segue o fluxo desenhado, e
travar o quadro só faria o supervisor registrar errado. O que o sistema garante
é que nada avança sem responsável e que a conclusão carimba a data.

### Roteiro é ordem de visita, não traçado de rua

O sistema não sabe onde tem semáforo. Sabe onde o técnico está, onde estão as OS
dele e o que é urgente — e com isso responde a pergunta que o supervisor faz de
verdade: **em que ordem atender**. O algoritmo é vizinho mais próximo com viés de
prioridade, e a tela mostra quanto isso economiza em relação a atender na ordem
de chegada.

### A recomendação nunca atribui sozinha

A fila inteligente (`/fila`) cruza urgência, distância, carga e material em posse,
e devolve os três melhores técnicos para cada OS — **com os motivos escritos ao
lado**. Cada recomendação vira um botão, não um fato. Um número de 0 a 100
sozinho não sustenta uma decisão que envolve gente.

Os pesos de cada critério são ajustáveis na Central de Controle.

---

## Integrações

### Rastreamento da frota — Traccar

A plataforma usada pela operação roda **Traccar 6.3**, com API REST
documentada. A conta não expõe geração de token no painel, então a conexão é
pelo **mesmo usuário e senha do login no site**:

```
TRACCAR_URL="https://rastreamentopopular.com"
TRACCAR_USUARIO="..."
TRACCAR_SENHA="..."
```

Convém pedir um usuário separado, só de leitura, para o sistema — assim a senha
pessoal de ninguém fica num arquivo de servidor.

Depois:

```bash
npm run traccar -- --verificar      # testa a credencial
npm run traccar -- --dispositivos   # lista os rastreadores da conta
npm run traccar -- --importar       # cadastra os veículos que faltam
npm run traccar -- --loop 60        # sincroniza a cada 60 segundos
```

A amarração é pelo `uniqueId` do Traccar contra o campo **ID no rastreador** do
cadastro de veículo, com a placa como alternativa.

**O rastreador sabe onde está o carro, não onde está o técnico.** Quem transforma
uma coisa na outra é o vínculo veículo↔técnico, mantido na Central de Controle.
Toda troca de motorista fica no histórico.

### Recepção de posições por webhook

A plataforma de rastreamento também pode enviar posições direto:

```
POST /api/rastreador
x-rastreador-segredo: <RASTREADOR_SEGREDO do .env>

{ "rastreador": "100001", "lat": -3.73, "lng": -38.57 }
```

Aceita um objeto ou uma lista. Sem `RASTREADOR_SEGREDO` definido, o endpoint
fica **desligado** — nunca aberto por engano.

### Ordens de serviço

O estoque **não sincroniza com o SGP**. Da OS guardamos apenas o mínimo para
responder o que foi usado em cada atendimento: número, cliente e itens. Ao lançar
uma saída com finalidade *Ordem de Serviço* ou *Instalação*, basta digitar o
número da OS — o registro é criado se ainda não existir.

---

## Segurança

- `.env` está no `.gitignore` e nunca deve ser commitado
- o banco local (`*.db`) também é ignorado — é recriado pelo seed
- o endpoint de posições exige segredo compartilhado
- toda operação registra autor, horário e valores anterior e novo na auditoria

Ainda **não há tela de login**: o usuário responsável é escolhido no seletor da
barra superior e assina todas as operações na auditoria. Autenticação e perfis de
acesso entram junto com o Bloco 3.

---

## Cobertura do escopo

**Bloco 1 — Estoque:** completo. Locais, materiais, serializados, entrada com
recebimento e divergência, saída, estoque por técnico e por equipe,
transferências, devolução, logística reversa, status do serial, reserva, estoque
mínimo e crítico, alertas, dashboard, entradas × saídas, consumo por material /
técnico / equipe, histórico completo, auditoria, ajuste manual, inventário,
código de barras, busca global, filtros, relatórios com exportação CSV, previsão
de consumo e detecção de anomalias.

**Bloco 2 — Ordens de Serviço:** cadastro e edição, lista com filtros, quadro
operacional com arrastar-e-soltar, atribuição de responsável, prioridade,
severidade, SLA com situação de prazo, carga por técnico, aderência ao SLA e
material aplicado por atendimento. A importação automática do SGP ainda não
traz dados — ver abaixo.

**Bloco 3 — Geolocalização:** Central de Controle, frota, vínculo
veículo↔técnico, ingestão de posições, mapa operacional, replay de trajeto com
detecção de paradas, regiões e bairros com responsável principal e reserva,
roteirização por proximidade e parâmetros de análise configuráveis.

**Bloco 4 — Inteligência:** fila inteligente com recomendação explicada,
score configurável e leitura da operação em linguagem corrente.

### O que falta

- **Autenticação.** Não há tela de login; o responsável vem de um seletor.
- **Importação de OS do SGP.** A rota `/api/os/list/` responde 200 mas devolve
  lista vazia mesmo com o token liberado — provavelmente o usuário mapeado ao
  token não enxerga ordens de serviço.
- **Produção.** SQLite → PostgreSQL, serviço, HTTPS e backup.
