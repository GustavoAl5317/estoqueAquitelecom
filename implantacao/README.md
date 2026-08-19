# Implantação

O que falta para a VM deixar de ser uma máquina de desenvolvimento rodando em
terminal aberto e virar um serviço. Nada aqui muda a aplicação — são arquivos
de sistema, e cada um vale por si: dá para colocar o systemd hoje e o HTTPS na
semana que vem.

Estado de origem: Debian 11, host `005-DB`, projeto em
`/root/estoqueAquitelecom`, `npm run dev` num terminal, SQLite, sem HTTPS.

| Arquivo | O que resolve |
|---|---|
| `estoque.service` | o sistema sobe sozinho no boot e volta sozinho depois de um erro |
| `nginx.conf` | porta 80/443 no lugar de `:3000`, e o caminho para o HTTPS |
| `backup.sh` | cópia diária do banco, com retenção |

---

## 1. Serviço (systemd)

`npm run dev` não deve rodar em produção: recompila a cada requisição, expõe
mensagens de erro internas e morre com a sessão SSH.

```bash
cd /root/estoqueAquitelecom
npm ci
npx prisma migrate deploy
npx prisma generate     # migrate deploy NÃO regenera o cliente
npm run build

cp implantacao/estoque.service /etc/systemd/system/estoque.service
systemctl daemon-reload
systemctl enable --now estoque
systemctl status estoque
```

Logs: `journalctl -u estoque -f`

### Atualizar depois de um `git pull`

```bash
cd /root/estoqueAquitelecom
git pull
npm ci
npx prisma migrate deploy && npx prisma generate
npm run build
systemctl restart estoque
```

A ordem importa: `migrate deploy` aplica a migração mas **não** regenera o
cliente Prisma — é a armadilha que já custou uma sessão inteira neste projeto.

---

## 2. HTTPS

Enquanto o sistema responder em HTTP, toda senha digitada na tela de login
trafega legível. Fora da rede do escritório isso é vazamento de credencial, não
detalhe de configuração.

```bash
apt install nginx certbot python3-certbot-nginx

cp implantacao/nginx.conf /etc/nginx/sites-available/estoque
ln -s /etc/nginx/sites-available/estoque /etc/nginx/sites-enabled/estoque
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d estoque.aquitelecom.com.br
```

Depois do certbot, feche a porta 3000 para o mundo — só o nginx precisa dela:

```bash
ufw allow 'Nginx Full' && ufw allow OpenSSH && ufw enable
```

**Antes disso é preciso um domínio apontando para o IP da VM.** Sem DNS o
certbot não emite certificado.

---

## 3. Backup

```bash
apt install sqlite3
cp implantacao/backup.sh /usr/local/bin/estoque-backup
chmod +x /usr/local/bin/estoque-backup
/usr/local/bin/estoque-backup          # confere que roda

crontab -e
# 0 2 * * *  /usr/local/bin/estoque-backup
```

Restaurar é parar o serviço, descompactar por cima e subir de novo:

```bash
systemctl stop estoque
gunzip -c /var/backups/estoque/estoque-AAAAMMDD-HHMMSS.db.gz \
  > /root/estoqueAquitelecom/prisma/dev.db
systemctl start estoque
```

> Backup guardado só na mesma VM protege contra erro humano, não contra perda
> da máquina. Copiar a pasta `/var/backups/estoque` para fora — outro servidor,
> um bucket, qualquer coisa — é o que fecha o risco. O `.env` fica de fora do
> backup de propósito: ele guarda as credenciais do SGP e do Traccar.

---

## 4. SQLite → PostgreSQL

**Esta é a única frente que exige uma decisão e uma janela de manutenção.** As
outras três são cópia de arquivo.

### Por que trocar

O SQLite aguenta a operação atual sem esforço. Ele aperta em duas situações
concretas, e as duas estão no caminho deste projeto:

- **Escrita concorrente.** O coletor do Traccar grava posições em laço enquanto
  a equipe usa o sistema. SQLite serializa escritas; sob carga isso vira
  `database is locked`.
- **Backup sem parar.** `pg_dump` roda com o sistema no ar. O `.backup` do
  SQLite também, mas restaurar exige derrubar o serviço.

Enquanto for um punhado de usuários e um coletor, SQLite entrega. A troca é
preventiva, não urgente — e por isso pode ser agendada.

### O que precisa mudar

1. **Servidor**

   ```bash
   apt install postgresql
   sudo -u postgres createuser --pwprompt estoque
   sudo -u postgres createdb --owner=estoque estoque
   ```

2. **`.env`**

   ```
   DATABASE_URL="postgresql://estoque:SENHA@localhost:5432/estoque"
   ```

3. **`prisma/schema.prisma`** — trocar o provider:

   ```prisma
   datasource db {
     provider = "postgresql"
   }
   ```

4. **`src/lib/prisma.ts`** — o Prisma 7 exige um driver adapter, e o atual é o
   do SQLite:

   ```bash
   npm i @prisma/adapter-pg pg
   ```

   ```ts
   import { PrismaPg } from "@prisma/adapter-pg";

   export const prisma =
     globalForPrisma.prisma ??
     new PrismaClient({
       adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
     });
   ```

5. **Migrações.** As seis migrações existentes são SQL de SQLite e não rodam no
   PostgreSQL. O caminho limpo é recomeçar o histórico:

   ```bash
   rm -rf prisma/migrations
   npx prisma migrate dev --name inicial
   ```

   Isso é aceitável porque o histórico de migração serve para reproduzir o
   schema, e o schema continua sendo o mesmo arquivo.

6. **Dados.** Duas situações:

   - **Base de demonstração:** não migre. `npm run db:seed` repopula.
   - **Base real:** exporte antes e reimporte depois. Com o volume atual — ordens,
     movimentos, posições — um script de cópia tabela a tabela pelo próprio
     Prisma é mais previsível que qualquer conversor de dump entre dialetos,
     porque respeita a ordem das chaves estrangeiras.

7. **Conferir.** `npm run db:check` compara saldo e razão; ele é o teste de que
   a carga não perdeu nada no caminho.

### O que já está pronto para isso

O schema evita de propósito tudo o que é específico de um banco: não usa `enum`
nem `Json` do Prisma — os domínios fechados são `String` validada em
`src/lib/dominio.ts`. Nenhuma consulta usa SQL cru. Na prática, a troca é o
provider, o adapter e as migrações.

O que **não** é automático: `mode: "insensitive"` nas buscas. No SQLite o
`contains` já ignora maiúsculas; no PostgreSQL, não. Depois da migração, as
buscas por nome em `listarOrdens`, `consultas.ts` e `busca-natural.ts` precisam
do modificador — senão procurar "aldeota" deixa de achar "Aldeota".
