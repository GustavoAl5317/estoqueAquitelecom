"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation,
  Pause,
  Play,
} from "lucide-react";
import { acaoMoverOrdem } from "@/app/acoes/operacao";
import {
  acaoAlternarJornada,
  acaoRegistrarLocalizacao,
} from "@/app/acoes/campo";
import { Aviso, Botao } from "./ui";

/**
 * 3.63 — O PRÓXIMO PASSO, COMO UM BOTÃO SÓ.
 *
 * Quem está na rua não navega menu. A tela mostra a ação seguinte do fluxo e
 * pronto; as alternativas ficam abaixo, menores, para o dia em que a realidade
 * não seguir o desenho — cliente ausente, serviço que não dá para fazer hoje.
 */
const PASSOS: Record<
  string,
  { proximo: string; rotulo: string; icone: typeof Navigation }
> = {
  ATRIBUIDA: {
    proximo: "EM_DESLOCAMENTO",
    rotulo: "Iniciar deslocamento",
    icone: Navigation,
  },
  EM_DESLOCAMENTO: {
    proximo: "EM_ATENDIMENTO",
    rotulo: "Cheguei — iniciar atendimento",
    icone: MapPin,
  },
  EM_ATENDIMENTO: {
    proximo: "CONCLUIDA",
    rotulo: "Finalizar atendimento",
    icone: CheckCircle2,
  },
  PENDENTE: {
    proximo: "EM_ATENDIMENTO",
    rotulo: "Retomar atendimento",
    icone: Play,
  },
  ABERTA: {
    proximo: "EM_DESLOCAMENTO",
    rotulo: "Iniciar deslocamento",
    icone: Navigation,
  },
};

export function PassoDoAtendimento({
  ordemId,
  status,
  latitude,
  longitude,
}: {
  ordemId: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const passo = PASSOS[status];

  function mover(novo: string, motivo?: string) {
    setErro(null);
    iniciar(async () => {
      const dados = new FormData();
      dados.set("ordemId", ordemId);
      dados.set("status", novo);
      if (motivo) dados.set("motivo", motivo);
      const resultado = await acaoMoverOrdem({}, dados);
      if (resultado.erro) setErro(resultado.erro);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {erro && <Aviso tom="critico">{erro}</Aviso>}

      {passo && (
        <Botao
          variante="primario"
          disabled={pendente}
          onClick={() => mover(passo.proximo)}
          className="w-full !py-3 text-base"
        >
          {pendente ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <passo.icone className="size-5" aria-hidden />
          )}
          {passo.rotulo}
        </Botao>
      )}

      <div className="flex flex-wrap gap-2">
        {status !== "PENDENTE" && status !== "CONCLUIDA" && (
          <Botao
            variante="secundario"
            disabled={pendente}
            onClick={() => {
              const motivo = window.prompt(
                "O que impediu o atendimento? (fica registrado)",
              );
              if (motivo !== null) mover("PENDENTE", motivo || undefined);
            }}
          >
            <Pause className="size-4" aria-hidden /> Não deu para atender
          </Botao>
        )}

        {latitude !== null && longitude !== null && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--borda-forte)] px-3 py-1.5 text-sm font-medium"
          >
            <MapPin className="size-4" aria-hidden /> Abrir rota no mapa
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * 3.4 / 3.5 — JORNADA E POSIÇÃO.
 *
 * A posição só é enviada com a jornada aberta e com a permissão concedida pelo
 * navegador. Os dois estados são mostrados: sem isso, o técnico não tem como
 * saber se está aparecendo no mapa da supervisão — e não saber disso é pior do
 * que não aparecer.
 */
export function ControleDeJornada({
  emJornada,
  ultimaPosicao,
}: {
  emJornada: boolean;
  ultimaPosicao: string | null;
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const [permissao, setPermissao] = useState<
    "desconhecida" | "concedida" | "negada" | "indisponivel"
  >("desconhecida");
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setPermissao("indisponivel");
      return;
    }
    if (!emJornada) return;

    let cancelado = false;

    const enviar = (posicao: GeolocationPosition) => {
      if (cancelado) return;
      setPermissao("concedida");
      iniciar(async () => {
        const resultado = await acaoRegistrarLocalizacao(
          posicao.coords.latitude,
          posicao.coords.longitude,
          posicao.coords.accuracy,
        );
        if (resultado.erro) setAviso(resultado.erro);
        else router.refresh();
      });
    };

    const falhar = (erro: GeolocationPositionError) => {
      if (cancelado) return;
      setPermissao(erro.code === erro.PERMISSION_DENIED ? "negada" : "indisponivel");
    };

    navigator.geolocation.getCurrentPosition(enviar, falhar, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 60_000,
    });

    // uma leitura a cada dois minutos é suficiente para acompanhar uma rota
    // urbana sem esvaziar a bateria de quem está trabalhando
    const relogio = setInterval(() => {
      navigator.geolocation.getCurrentPosition(enviar, falhar, {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 60_000,
      });
    }, 120_000);

    return () => {
      cancelado = true;
      clearInterval(relogio);
    };
  }, [emJornada, router]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Botao
          variante={emJornada ? "secundario" : "primario"}
          onClick={() =>
            iniciar(async () => {
              await acaoAlternarJornada(!emJornada);
              router.refresh();
            })
          }
        >
          {emJornada ? (
            <>
              <Pause className="size-4" aria-hidden /> Encerrar jornada
            </>
          ) : (
            <>
              <Play className="size-4" aria-hidden /> Iniciar jornada
            </>
          )}
        </Botao>

        <span className="text-xs text-[var(--texto-3)]">
          {!emJornada
            ? "Fora da jornada o sistema não registra sua posição."
            : permissao === "concedida"
              ? `Posição enviada${ultimaPosicao ? ` · ${ultimaPosicao}` : ""}`
              : permissao === "negada"
                ? "Permissão de localização negada"
                : permissao === "indisponivel"
                  ? "Localização indisponível neste aparelho"
                  : "Aguardando permissão de localização…"}
        </span>
      </div>

      {emJornada && permissao === "negada" && (
        <Aviso tom="atencao" titulo="A supervisão não está vendo onde você está">
          O navegador bloqueou a localização. Toque no cadeado ao lado do
          endereço e permita o acesso — sem isso, você fica de fora da
          distribuição por proximidade.
        </Aviso>
      )}

      {aviso && <Aviso tom="atencao">{aviso}</Aviso>}
    </div>
  );
}
