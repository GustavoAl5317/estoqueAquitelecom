# Manual de uso

Guia prático: o que cada tela faz, onde clicar, onde cadastrar. Para
arquitetura e histórico técnico, ver `CONTEXTO.md`.

---

## Perfis de acesso

| Perfil | Enxerga |
|---|---|
| **ADMIN** | tudo |
| **SUPERVISOR** | estoque, OS, Central de Controle — não mexe em Configurações/Usuários |
| **ALMOXARIFE** | estoque completo + ver OS — sem Central de Controle |
| **TECNICO** | Meu dia + só as próprias OS |
| **VISUALIZACAO** | só leitura de estoque e OS |

Cadastro de usuário e troca de perfil: **Usuários e acesso** (só ADMIN).

---

## OPERAÇÃO

**Dashboard** (`/`) — números do dia: estoque crítico, OS em aberto, alertas.

**Central de Controle** (`/central`) — painel dos rastreadores (veículo/celular/equipamento), formulário de classificar aparelho, vincular veículo↔técnico, ajustar os pesos do score de recomendação e o raio de chegada.

**Fila inteligente** (`/fila`) — OS abertas ordenadas por urgência, cada uma com até 3 técnicos recomendados e o motivo. Botão **Atribuir** só aparece se existir candidato (precisa: OS com coordenada + técnico com posição conhecida). Sem candidato, atribua manual pela tela da OS ou pelo Quadro.

**Central de decisão** (`/decisao`) — o que vai estourar prazo (previsão calculada por deslocamento + tempo médio do tipo de serviço), quem está sem responsável, e sugestões de rebalanceamento de carga/cobertura. Cada linha tem um link "resolver".

**Alertas** (`/alertas`) — estoque abaixo do mínimo/crítico.

**Análise e previsão** (`/analise`) — previsão de consumo de material e detecção de anomalias (Bloco 1, não confundir com previsão de atraso de OS).

---

## CAMPO

**Meu dia** (`/campo`) — tela do técnico: próximo passo do atendimento (um botão só), abrir/fechar jornada (liga o envio de posição pelo navegador).

**Ordens de serviço** (`/os`) — lista com filtro (status, técnico, prioridade, tipo, busca, risco de SLA). Aqui salva **Visões** (recorte de filtro guardado — botão "Salvar esta" aparece com filtro aplicado).

**Quadro operacional** (`/os/quadro`) — kanban, arrasta card entre colunas pra mudar status. Seletor **"Quadro único / Por técnico / Por equipe / Por bairro"** no topo corta o quadro em faixas. Dropdown de técnico em cada card = atribuição manual, sempre disponível.

**Mapa e incidentes** (`/os/mapa`) — OS e veículos no mapa, com tiles de rua reais.

**Roteiro do dia** (`/roteiro`) — ordem sugerida de atendimento por proximidade.

**Regiões e bairros** (`/regioes`) — cadastro de bairro (responsável principal/reserva, equipe), cobertura, performance por região, **editor de contorno do bairro** (clica no mapa pra desenhar o polígono — é isso que faz OS do SGP cair sozinha no bairro certo) e sugestões de rebalanceamento.

---

## ESTOQUE

**Materiais** (`/materiais`) — cadastro de material, estoque mínimo/crítico.

**Equipamentos** (`/seriais`) — itens com número de série (rastreáveis um a um).

**Locais e detentores** (`/locais`) — onde o estoque fica: almoxarifado, veículo, técnico, equipe.

---

## MOVIMENTAÇÃO

**Entradas** (`/entradas`) — recebimento de material, com conferência e divergência.

**Saídas e transferências** (`/movimentacoes`) — saída pra técnico/OS, transferência entre locais, devolução, baixa. Tem captura de coordenada opcional (botão "Registrar onde estou").

**Material por OS** (`/ordens`) — o que foi usado em cada atendimento.

**Logística reversa** (`/triagem`) — material devolvido com avaria, aguardando laudo.

**Reservas** (`/reservas`) — material reservado pra uma OS específica, tira do saldo livre.

**Inventário** (`/inventario`) — contagem física, ajuste por divergência.

---

## GESTÃO

**Relatórios** (`/relatorios`) — exportação CSV.

**Auditoria** (`/auditoria`) — quem fez o quê, com valor antes/depois. Não edita nada, só mostra.

**Configurações** (`/configuracoes`) — aqui ficam os cadastros "de base":
- **Técnico** — nome, matrícula, telefone, equipe (é aqui que se cadastra quem pode ser responsável por OS)
- **Equipe**
- **Fornecedor**

**Usuários e acesso** (`/usuarios`) — criar login, definir perfil, resetar senha.

---

## Passo a passo — tarefas comuns

### Cadastrar um técnico novo
Configurações → card **Técnicos** → nome, matrícula, telefone, equipe → **Criar técnico**.
Se ele precisa logar no sistema (usar o `/campo`), crie o usuário em **Usuários e acesso** e vincule ao técnico.

### Atribuir uma OS sem recomendação
Abra a OS (`/os/[numero]`) → card **Responsável** → escolhe no dropdown → salva.
Ou pelo Quadro: dropdown de técnico direto no card.

### Desenhar o contorno de um bairro
Regiões e bairros → card **Contorno dos bairros** → escolhe o bairro no seletor → clica no mapa marcando os cantos (mínimo 3 pontos) → **Salvar contorno**. Arrastar move o mapa, não marca ponto.

### Ver por que uma previsão de atraso está apertada
Central de decisão → coluna **"Por quê"** explica: km até o cliente, tempo médio do tipo de serviço, ou motivo de não ter previsão (sem responsável / sem coordenada / sem posição do técnico).

### Ajustar o peso da recomendação de técnico
Central de Controle → card de parâmetros → arrasta os sliders (distância, carga, material, região, disponibilidade — soma tem que fechar perto de 100) → **Salvar parâmetros**. Mesmo card tem o raio de chegada (metros) e se a chegada move a OS pra "em atendimento" sozinha ou só registra.

### Salvar um filtro que você usa toda hora
Filtre a lista (em `/os`, `/os/quadro` ou `/fila`) → clica **"Salvar esta"** na barra de Visões → dá um nome → opcionalmente marca "compartilhar com a equipe".

---

## Comandos de terminal (referência rápida)

Ver `CONTEXTO.md` seção 6 para a lista completa. Os que mais importam no dia a dia:

```bash
npm run sgp:sync                      # sincroniza OS dos contratos já conhecidos
npm run sgp:sync -- --de 1 --ate 6000 # varredura ampla, descobre contrato novo
npm run traccar -- --loop 60          # posição de veículo em loop
npm run db:check                      # confere saldo x razão do estoque
```

Na VM, o sistema roda como serviço (`systemctl status estoque`) — reinicia sozinho se cair. Detalhes de implantação: `implantacao/README.md`.
