# Contexto do projeto

Documento de passagem. Quem chegar agora lê isto antes de mexer em qualquer
coisa — inclusive uma sessão futura de assistente.

---

## 1. O que é

Plataforma operacional para a **Aqui Telecom**, provedor de internet em
Fortaleza. Aplicação web única, responsiva, **sem aplicativo mobile** — essa
restrição é do escopo e é dura: nada de PWA como produto separado, nada de
nativo. O técnico usa a mesma plataforma pelo navegador.

Quatro blocos de escopo:

| Bloco | Assunto | Estado |
|---|---|---|
| 1 | Estoque e rastreabilidade | completo |
| 2 | Ordens de serviço | completo, com sincronização SGP funcionando |
| 3 | Geolocalização e campo | completo |
| 4 | Inteligência operacional | completo, com a Central de Decisão |

---

## 2. Decisões do cliente que moldaram o produto

Estas vieram do cliente e **não devem ser revertidas** sem falar com ele:

1. **O estoque não passa pelo SGP.** É sistema à parte. Não existe API, banco
   nem planilha de onde importar material. O cliente confirmou depois que o
   cadastro de estoque **será todo manual**.

2. **Da OS, guardar o mínimo:** número, cliente e itens usados. O SGP continua
   sendo a fonte oficial das ordens.

3. **Os veículos seguem como fonte de localização**, e é preciso uma Central de
   Controle para ajustar os dados de análise.

4. Descoberto depois, e mais importante que o item 3: **a conta de rastreamento
   tem celular de técnico**. Isso mudou a arquitetura — ver seção 4.

---

## 3. Estrutura do repositório

```
implantacao/         systemd, nginx, backup e o caminho para o PostgreSQL

prisma/
  schema.prisma      modelo dos quatro blocos
  seed.ts            ~90 dias de operação fictícia
  verificar.ts       conferência saldo × razão
  migrations/        8 migrações

scripts/
  acesso.ts          diagnóstico e reparo de login
  iniciar-producao.ts limpa a base e prepara para uso real
  sgp-explorar.ts    sonda da API do SGP
  sgp-sincronizar.ts importa OS do SGP
  traccar.ts         coletor de posições

src/
  proxy.ts           barreira de sessão (era middleware.ts; o Next 16 renomeou)
  app/
    acoes/           server actions
    …                43 rotas
  components/        design system e formulários
  lib/
    auth.ts          scrypt, sessão, senha
    permissoes.ts    capacidades por papel
    sessao.ts        usuário atual e barreira
    dominio.ts       domínios fechados — fonte única de verdade
    servicos/        27 arquivos de regra de negócio
```

### Conceitos centrais

**Detentor** unifica Estoque, Técnico e Equipe. Por isso toda transferência é a
mesma operação, com o mesmo código e a mesma auditoria.

**O razão de movimentos é imutável.** `Movimento` nunca muda; `Saldo` é
consequência. `npm run db:check` prova a igualdade — hoje 103/103.

**Rastreador é entidade própria**, separada do que ele rastreia. Ver seção 4.

**Permissão por capacidade, não por tela.** `permissoes.ts` declara o que cada
papel pode fazer; a checagem acontece no servidor, no `layout.tsx`. Esconder
botão no cliente organiza a tela, não protege o dado.

---

## 4. Rastreamento — a parte que mais mudou

A conta do **rastreamentopopular.com** (que é um **Traccar 6.3**) tem 15
aparelhos, e eles **não são uma frota**:

| Tipo | Exemplos | Vira o quê |
|---|---|---|
| Veículo | GOL, Celta NUN-8248 | posição do carro; a pessoa vem do vínculo de motorista |
| Celular de técnico | IGOR-S23, JERCILANIO-A35, S22-VINICIUS | **a posição já é da pessoa** |
| Equipamento | 4 OTDR, máquina de fusão ORIENTEK | onde está o patrimônio (Bloco 1) |
| Não classificado | T-40 VERDE/AZUL, telefone 55, Telefone Celta, AGILE | ninguém sabe ainda |

**A sincronização importa o aparelho e para aí.** Classificar é decisão humana,
feita em `/central`. Adivinhar por nome acertaria a maioria e erraria o
suficiente para alguém confiar num dado errado.

Quando um técnico tem celular *e* carro, a fila e o roteiro usam o **celular**:
quando ele desce para atender, o carro fica na rua e o celular vai junto.

> **Pendência legal:** S23, A35 e S22 parecem aparelhos pessoais. Rastreamento
> contínuo de celular particular de funcionário tem implicação de LGPD e de
> acordo trabalhista. O sistema só grava com a jornada aberta, mas a política é
> decisão do cliente e **ainda não foi confirmada**.

---

## 5. Integração com o SGP

### O que custou caro descobrir

A documentação pública aponta `/api/os/list/`. **Essa rota existe e nunca
devolve OS.** O endpoint certo é:

```
POST /api/central/chamado/list/
```

Com `app` + `token` + `contrato` (ou `cliente`), em **form-data**. Cada registro
traz o chamado (`oc_*`) e a ordem gerada a partir dele (`os_*`) na mesma linha.

Outras armadilhas, todas confirmadas em produção:

- **Não existe listagem geral.** Consulta um contrato por vez. A varredura por
  faixa (`--de/--ate`) existe por isso.
- **`403` intermitente é limite de requisição, não permissão.** Perseguimos
  permissão por três rodadas por causa disso. O intervalo padrão é 4 segundos.
- **`os_id` chega como número** quando há OS e string vazia quando não há.
- **`contrato_endereco_ll` já traz latitude e longitude** — a OS entra no mapa
  sem geocodificação.
- O domínio real é `aquitelecom.sgp.tsmx.com.br`, não `sys.aquitelecom.com`.

### Estado

Funciona. Testado contra produção: contrato 2503 importou a OS 31346 com
coordenada real; reexecutar não duplica.

```bash
npm run sgp:sync -- --contratos 2503,2505
npm run sgp:sync -- --de 2500 --ate 2600
```

### Incidente que não pode se repetir

Numa sessão anterior, um `POST` para `/api/ura/chamado/` **abriu um chamado
real** no contrato 5510 — protocolo `260815112000`. Era um endpoint de
listagem presumida que na verdade cria registro.

**Regra:** não chamar endpoint desconhecido desse SGP sem confirmação explícita
do Gustavo. Endpoints já validados (`consultacliente`, `chamado/list`) são
seguros.

O chamado 260815112000 **ainda precisa ser cancelado**.

---

## 6. Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `start` | produção |
| `npm run db:seed` | popula com ~90 dias fictícios |
| `npm run db:limpar` | apaga tudo e **não** repopula |
| `npm run db:reset` | apaga e repopula o seed |
| `npm run db:check` | confere saldo × razão |
| `npm run acesso` | diagnóstico de login |
| `npm run producao -- --admin "Nome" email senha` | prepara para uso real |
| `npm run traccar -- --importar` | traz os aparelhos reais |
| `npm run traccar -- --loop 60` | sincroniza posições |
| `npm run sgp -- --path api/... --form` | sonda a API |
| `npm run sgp:sync -- --contratos N,N` | importa OS |

### Acesso da base de demonstração

```
admin@operacao.local  ·  estoque2026
```

Os demais usuários usam a mesma senha e trocam no primeiro acesso. Enquanto o
seed estiver aplicado, **uma faixa amarela avisa em todas as telas** que os
dados são fictícios — ela some sozinha após `db:limpar`.

---

## 7. Ambiente

### Git

`https://github.com/GustavoAl5317/estoqueAquitelecom` — branch `main`.

O `.gitignore` cobre `.env*`, `*.db`, `sgp-amostra*.json` e as pastas de
ferramentas de editor. **Nunca commitar `.env` nem amostras da API** — elas
contêm dados de cliente.

### VM

Debian 11, host `005-DB`, projeto em `/root/estoqueAquitelecom`.
Node instalado via NodeSource.

Ainda **não há systemd, nginx nem HTTPS** aplicados na VM. Roda com
`npm run dev` em terminal aberto e banco SQLite. Os arquivos prontos para
mudar isso estão em `implantacao/` — falta executá-los lá.

**Armadilha recorrente:** `prisma migrate deploy` aplica a migração mas **não
regenera o cliente**. Depois de `git pull` com migração nova:

```bash
npx prisma generate && npm run db:seed
```

O seed hoje detecta isso e diz qual tabela falta.

### `.env`

Só existe na máquina de desenvolvimento e na VM. Precisa de:

```
DATABASE_URL         file:./prisma/dev.db
SGP_BASE_URL         https://aquitelecom.sgp.tsmx.com.br
SGP_APP / SGP_TOKEN  credenciais da API
TRACCAR_URL          https://rastreamentopopular.com
TRACCAR_USUARIO      login do site (a conta não oferece token)
TRACCAR_SENHA
RASTREADOR_SEGREDO   opcional — só para webhook; com Traccar por polling, deixe vazio
```

> O token do SGP passou pelo chat mais de uma vez. **Deve ser rotacionado** em
> Administração → Integrações → Tokens. Mesma coisa para a senha do Traccar.

---

## 8. O que falta do escopo

**Nada.** As seis frentes que faltavam foram fechadas em 19/08/2026:

| Escopo | O que é | Onde está |
|---|---|---|
| 2.19 / 3.29 | Visões salvas | `visoes.ts` + `visoes-salvas.tsx`, em `/os`, `/os/quadro` e `/fila` |
| 3.25–3.27 | Quadro por técnico, equipe e bairro | `quadroPorRecorte` em `ordens.ts`; seletor de recorte em `/os/quadro` |
| 3.34–3.36 | Cerca, chegada e tempo no local | `geofence.ts`; parâmetros na Central; campos novos na OS |
| 3.43–3.46 / 3.57 | Performance territorial e rebalanceamento | `regioes.ts` → `/regioes` |
| 3.56 / 4.10 | Previsão de atraso e Central de Decisão | `decisao.ts` → `/decisao` |
| 1.35 / 3.17 | Coordenada na movimentação e contorno do bairro | formulário de movimentação; `EditorDePoligono` em `/regioes` |

Três decisões tomadas aí que vale conhecer antes de mexer:

1. **A cerca registra chegada sempre, mas só move o status se alguém ligar.**
   `moverAoChegar` nasce em 0. Mudar a situação da OS de outra pessoa sozinho
   produz registro bonito e realidade errada.
2. **A previsão de atraso usa mediana, não média.** Uma OS esquecida aberta a
   noite toda levava a média do tipo para doze horas.
3. **O contorno do bairro é desenhado à mão.** Não existe base oficial para
   importar, e com ele a OS que chega do SGP só com coordenada encontra sozinha
   a área e o responsável.

### Fora do escopo, mas necessário para produção

Os arquivos e o passo a passo estão em `implantacao/` — systemd, nginx com
HTTPS e backup são cópia de arquivo; só o PostgreSQL exige janela.

- SQLite → PostgreSQL (`implantacao/README.md`, seção 4)
- systemd (`implantacao/estoque.service`)
- nginx e HTTPS (`implantacao/nginx.conf`)
- rotina de backup (`implantacao/backup.sh`)
- rotação das credenciais que passaram pelo chat

---

## 9. Pendências com terceiros

| O quê | Com quem |
|---|---|
| Cancelar o chamado `260815112000`, contrato 5510 | Lucas |
| Confirmar se os celulares rastreados são pessoais ou corporativos | cliente |
| Dizer o que são "T-40 VERDE/AZUL", "telefone 55", "Telefone Celta", "AGILE" | cliente |
| Carga inicial de materiais e saldo | cliente — decidiu que será manual |

---

## 10. Como o Gustavo trabalha

- **Prefere velocidade.** Interrompe com "termina logo" quando a resposta
  demora. Entregar em lotes verificados e commitados vale mais que explicar.
- **Recusa dependência nova** sem necessidade real. O código de barras Code 128,
  os gráficos SVG e o mapa com tiles do OpenStreetMap foram todos implementados
  à mão por isso.
- **Não manda credencial por chat** — e quando manda, deve ser avisado para
  rotacionar.
- Fala português. Todo o código, comentário e interface estão em português.
