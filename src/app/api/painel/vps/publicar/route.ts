import { after, type NextRequest } from "next/server";

import {
  consumeVpsAttempt,
  exigirDonoDaVps,
  requireVpsRequest,
} from "@/features/vps/acesso";
import { VPS_UPLOAD_MAX_BYTES } from "@/features/vps/file-paths";
import { R_UUID, VpsError } from "@/features/vps/modelo";
import { inspecionarZip } from "@/features/vps/pacote-zip";
import { releaseParaDTO, tarefaParaDTO } from "@/features/vps/queries";
import {
  auditar,
  publicarZip,
  respostaDeErroVps,
} from "@/features/vps/servico";

/*
  POST /api/painel/vps/publicar (multipart: siteId, arquivo) — o upload do
  ZIP de uma versão (§6.3). É route handler, e não server action, porque a
  action tem teto de 1 MB e o ZIP vai até 3 MB.

  Ordem: mesma origem do painel (Origin/sec-fetch-site), dono com login
  recente, limite de ações, tamanho ANTES de ler o formulário, inspeção do
  ZIP (problemas voltam com arquivo e motivo em português) e, numa
  transação, artefato + versão `enviando` + tarefa assinada.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** O multipart soma cabeçalhos e o nome do campo ao ZIP de até 3 MB. */
const LIMITE_DO_PEDIDO = 3_300_000;

export async function POST(request: NextRequest) {
  try {
    requireVpsRequest(request);
    const { session, db, workspaceId } = await exigirDonoDaVps({
      alterar: true,
      recente: true,
    });
    await consumeVpsAttempt(db, workspaceId, session.user.id, "publicar");

    const declarado = Number(request.headers.get("content-length"));
    if (!Number.isFinite(declarado) || declarado <= 0)
      throw new VpsError(
        411,
        "dados_invalidos",
        "O envio chegou sem tamanho declarado. Tente de novo pelo painel.",
      );
    if (declarado > LIMITE_DO_PEDIDO) throw muitoGrande();

    let formulario: FormData;
    try {
      formulario = await request.formData();
    } catch {
      throw new VpsError(400, "dados_invalidos", "Envio inválido.");
    }
    const siteId = formulario.get("siteId");
    const arquivo = formulario.get("arquivo");
    if (typeof siteId !== "string" || !R_UUID.test(siteId))
      throw new VpsError(400, "dados_invalidos", "Site inválido.", {
        erros: { siteId: "Escolha o site." },
      });
    if (!(arquivo instanceof File))
      throw new VpsError(400, "dados_invalidos", "Escolha um arquivo .zip.", {
        erros: { arquivo: "Escolha um arquivo .zip." },
      });
    if (!/\.zip$/i.test(arquivo.name))
      throw new VpsError(
        400,
        "dados_invalidos",
        "O arquivo precisa ser .zip (as páginas compactadas).",
        { erros: { arquivo: "Só .zip." } },
      );
    if (arquivo.size < 1)
      throw new VpsError(400, "dados_invalidos", "O ZIP está vazio.");
    if (arquivo.size > VPS_UPLOAD_MAX_BYTES) throw muitoGrande();

    const bytes = Buffer.from(await arquivo.arrayBuffer());
    if (bytes.length > VPS_UPLOAD_MAX_BYTES) throw muitoGrande();
    const inspecao = inspecionarZip(bytes);
    if (!inspecao.ok)
      return Response.json(
        {
          ok: false,
          codigo: "zip_com_problemas",
          error: "O ZIP tem problemas",
          problemas: inspecao.problemas,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );

    const por = session.user.email || session.user.id;
    const { release, tarefa } = await publicarZip(db, {
      workspaceId,
      siteId,
      por,
      nomeDoArquivo: arquivo.name,
      bytes,
      inspecao,
    });
    after(() =>
      auditar(db, {
        workspaceId,
        acao: "site.publicacao_enviada",
        entidade: "vps_site",
        entidadeId: siteId,
        por,
        campos: {
          versaoId: release.id,
          arquivo: release.fileName,
          arquivos: release.fileCount,
          bytesZip: release.zipBytes,
        },
      }),
    );
    return Response.json(
      {
        ok: true,
        versao: releaseParaDTO(release),
        tarefa: tarefaParaDTO(tarefa),
        avisos: inspecao.avisos,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    return respostaDeErroVps(erro);
  }
}

function muitoGrande(): VpsError {
  return new VpsError(
    413,
    "muito_grande",
    "O ZIP passa de 3 MB. Tire vídeos e imagens grandes (ou comprima) e envie de novo.",
  );
}
