"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eraser, Save, Undo2 } from "lucide-react";
import { acaoSalvarPoligono } from "@/app/acoes/operacao";
import { Aviso, Botao, Etiqueta } from "./ui";
import { MapaRuas, type PoligonoMapa } from "./mapa-ruas";

export type BairroComContorno = {
  id: string;
  nome: string;
  cidade: string;
  vertices: [number, number][];
};

const COR_EDITANDO = "#2563eb";
const COR_OUTROS = "#94a3b8";

/**
 * 3.17 — CONTORNO DO BAIRRO.
 *
 * Escolhe-se o bairro, clica-se no mapa, e cada clique vira um vértice. É
 * grosseiro de propósito: não existe base oficial de limite de bairro em
 * Fortaleza para importar, e o contorno aproximado que o supervisor desenha em
 * dois minutos já resolve o que precisa resolver — dizer de quem é a área de
 * uma OS que chegou do SGP só com coordenada.
 *
 * O desenho só vale depois de salvo. Enquanto isso ele fica na tela, e sair da
 * página descarta — errar clicando não deve custar nada.
 */
export function EditorDePoligono({ bairros }: { bairros: BairroComContorno[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [bairroId, setBairroId] = useState(bairros[0]?.id ?? "");
  const [vertices, setVertices] = useState<[number, number][]>(
    bairros[0]?.vertices ?? [],
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const bairro = bairros.find((b) => b.id === bairroId);
  const sujo =
    JSON.stringify(vertices) !== JSON.stringify(bairro?.vertices ?? []);

  function trocarBairro(id: string) {
    setBairroId(id);
    setVertices(bairros.find((b) => b.id === id)?.vertices ?? []);
    setErro(null);
    setSalvo(false);
  }

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const dados = new FormData();
      dados.set("bairroId", bairroId);
      dados.set("vertices", JSON.stringify(vertices));

      const resultado = await acaoSalvarPoligono({}, dados);
      if (resultado.erro) return setErro(resultado.erro);

      setSalvo(true);
      router.refresh();
    });
  }

  const poligonos: PoligonoMapa[] = bairros.map((b) => ({
    id: b.id,
    rotulo: b.nome,
    vertices: b.id === bairroId ? vertices : b.vertices,
    cor: b.id === bairroId ? COR_EDITANDO : COR_OUTROS,
    editando: b.id === bairroId,
  }));

  if (!bairros.length) {
    return (
      <Aviso tom="informativo" titulo="Nenhum bairro cadastrado">
        Cadastre um bairro ao lado para poder desenhar o contorno dele.
      </Aviso>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={bairroId}
          onChange={(evento) => trocarBairro(evento.target.value)}
          className="min-w-[14rem]"
          aria-label="Bairro a desenhar"
        >
          {bairros.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nome} — {b.cidade}
              {b.vertices.length ? " ✓" : ""}
            </option>
          ))}
        </select>

        <Etiqueta tom={vertices.length >= 3 ? "positivo" : "neutro"}>
          {vertices.length} ponto(s)
        </Etiqueta>

        <Botao
          variante="sutil"
          onClick={() => setVertices((atual) => atual.slice(0, -1))}
          disabled={!vertices.length || pendente}
        >
          <Undo2 className="size-4" aria-hidden /> Desfazer
        </Botao>
        <Botao
          variante="sutil"
          onClick={() => setVertices([])}
          disabled={!vertices.length || pendente}
        >
          <Eraser className="size-4" aria-hidden /> Limpar
        </Botao>
        <Botao
          variante="primario"
          onClick={salvar}
          disabled={!sujo || pendente}
        >
          <Save className="size-4" aria-hidden /> Salvar contorno
        </Botao>
      </div>

      {erro && <Aviso tom="critico">{erro}</Aviso>}
      {salvo && !sujo && (
        <Aviso tom="positivo">
          Contorno salvo. As OS que chegarem do SGP com coordenada dentro dele
          passam a cair neste bairro sozinhas.
        </Aviso>
      )}

      <MapaRuas
        pontos={[]}
        poligonos={poligonos}
        altura={420}
        aoClicarNoMapa={(latitude, longitude) => {
          setSalvo(false);
          setVertices((atual) => [...atual, [latitude, longitude]]);
        }}
      />

      <p className="text-xs text-[var(--texto-3)]">
        Clique no mapa para marcar cada canto do bairro; arrastar move o mapa
        sem marcar nada. Três pontos já fecham uma área — quanto mais pontos,
        mais fiel o contorno.
      </p>
    </div>
  );
}
