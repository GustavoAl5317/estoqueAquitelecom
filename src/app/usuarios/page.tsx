import { prisma } from "@/lib/prisma";
import { exigir } from "@/lib/sessao";
import { PAPEL_USUARIO } from "@/lib/dominio";
import { capacidadesDe } from "@/lib/permissoes";
import { dataHora, tempoRelativo } from "@/lib/utils";
import {
  Aviso,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Linha,
  Metrica,
  Tabela,
  Td,
  Th,
} from "@/components/ui";
import { LinhaUsuario, NovoUsuario } from "@/components/formularios-usuario";

export const dynamic = "force-dynamic";

/**
 * 3.67 — USUÁRIOS E ACESSO.
 *
 * Perfil é decisão de segurança, não de conveniência: aqui se vê quem tem
 * acesso a quê e quando cada um entrou pela última vez. Conta sem senha
 * definida aparece marcada — ela não consegue entrar, e alguém precisa saber
 * disso antes do dia em que a pessoa precisar trabalhar.
 */
export default async function Usuarios() {
  await exigir("sistema.administrar");

  const [usuarios, tecnicosCadastrados] = await Promise.all([
    prisma.usuario.findMany({
      include: {
        tecnico: { select: { id: true, nome: true } },
        _count: { select: { sessoes: true } },
      },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    }),
    prisma.tecnico.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, usuarioId: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  // "livre" é o que ainda não responde por nenhum login
  const tecnicos = tecnicosCadastrados.map((t) => ({
    id: t.id,
    nome: t.nome,
    livre: t.usuarioId === null,
  }));

  const semSenha = usuarios.filter((u) => u.ativo && !u.senhaHash);
  const administradores = usuarios.filter(
    (u) => u.ativo && u.papel === "ADMIN",
  ).length;

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários e acesso"
        descricao="Quem entra no sistema e o que cada perfil alcança. Toda operação fica assinada pelo usuário que a executou."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica
          rotulo="Ativos"
          valor={usuarios.filter((u) => u.ativo).length}
        />
        <Metrica
          rotulo="Administradores"
          valor={administradores}
          tom={administradores === 1 ? "atencao" : "neutro"}
          detalhe={administradores === 1 ? "só um — risco de travar" : undefined}
        />
        <Metrica
          rotulo="Sem senha definida"
          valor={semSenha.length}
          tom={semSenha.length > 0 ? "atencao" : "positivo"}
        />
        <Metrica
          rotulo="Sessões abertas"
          valor={usuarios.reduce((s, u) => s + u._count.sessoes, 0)}
        />
      </div>

      {semSenha.length > 0 && (
        <div className="mb-4">
          <Aviso
            tom="atencao"
            titulo={`${semSenha.length} usuário(s) sem senha`}
          >
            {semSenha.map((u) => u.nome).join(", ")} — essas contas existem, mas
            não conseguem entrar. Defina uma senha inicial na linha
            correspondente.
          </Aviso>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Cartao titulo={`${usuarios.length} usuário(s)`} semPadding>
            <Tabela>
              <thead>
                <tr>
                  <Th>Usuário</Th>
                  <Th>Perfil</Th>
                  <Th>Último acesso</Th>
                  <Th>Situação</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <Linha key={usuario.id}>
                    <Td>
                      <span className="text-sm font-medium">{usuario.nome}</span>
                      <span className="block text-xs text-[var(--texto-3)]">
                        {usuario.email}
                      </span>
                      {usuario.tecnico && (
                        <Etiqueta tom="roxo">técnico de campo</Etiqueta>
                      )}
                    </Td>
                    <Td>
                      <Etiqueta tom={PAPEL_USUARIO.tom(usuario.papel)}>
                        {PAPEL_USUARIO.rotulo(usuario.papel)}
                      </Etiqueta>
                      <span className="mt-0.5 block text-[11px] text-[var(--texto-3)]">
                        {capacidadesDe(usuario.papel).length} permissão(ões)
                      </span>
                    </Td>
                    <Td className="text-xs text-[var(--texto-3)]">
                      {usuario.ultimoAcesso ? (
                        <>
                          {tempoRelativo(usuario.ultimoAcesso)}
                          <span className="block">
                            {dataHora(usuario.ultimoAcesso)}
                          </span>
                        </>
                      ) : (
                        "nunca entrou"
                      )}
                    </Td>
                    <Td>
                      {!usuario.ativo ? (
                        <Etiqueta tom="neutro">inativo</Etiqueta>
                      ) : !usuario.senhaHash ? (
                        <Etiqueta tom="atencao">sem senha</Etiqueta>
                      ) : usuario.trocarSenha ? (
                        <Etiqueta tom="informativo">troca pendente</Etiqueta>
                      ) : (
                        <Etiqueta tom="positivo" ponto>
                          ativo
                        </Etiqueta>
                      )}
                    </Td>
                    <Td>
                      <LinhaUsuario
                        usuario={{
                          id: usuario.id,
                          nome: usuario.nome,
                          email: usuario.email,
                          papel: usuario.papel,
                          ativo: usuario.ativo,
                          tecnicoId: usuario.tecnico?.id ?? null,
                        }}
                        tecnicos={tecnicos}
                      />
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          </Cartao>
        </div>

        <div className="space-y-4">
          <Cartao titulo="Novo usuário">
            <NovoUsuario tecnicos={tecnicos} />
          </Cartao>

          <Cartao titulo="O que cada perfil alcança">
            <ul className="space-y-3">
              {PAPEL_USUARIO.opcoes.map((papel) => (
                <li key={papel.valor}>
                  <Etiqueta tom={papel.tom}>{papel.rotulo}</Etiqueta>
                  <ul className="mt-1 space-y-0.5">
                    {capacidadesDe(papel.valor).map((capacidade) => (
                      <li
                        key={capacidade}
                        className="font-mono text-[11px] text-[var(--texto-3)]"
                      >
                        {capacidade}
                      </li>
                    ))}
                    {capacidadesDe(papel.valor).length === 0 && (
                      <li className="text-[11px] text-[var(--texto-3)]">
                        sem permissões
                      </li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          </Cartao>
        </div>
      </div>
    </>
  );
}
