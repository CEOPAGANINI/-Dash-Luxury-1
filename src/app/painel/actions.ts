"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EstadoForm = { erro?: string; ok?: string };

async function usuario() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function paraNumero(entrada: FormDataEntryValue | null) {
  const texto = String(entrada ?? "0").replace(/\./g, "").replace(",", ".");
  const valor = Number(texto);
  return Number.isFinite(valor) && valor >= 0 ? valor : null;
}

/* ---------------- financeiro ---------------- */

export async function adicionarMovimento(
  _estado: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { supabase, user } = await usuario();
  if (!user) return { erro: "Sessão expirada. Entre de novo." };

  const descricao = String(formData.get("descricao") ?? "").trim();
  const valor = paraNumero(formData.get("valor"));
  const tipo = String(formData.get("tipo") ?? "entrada");

  if (!descricao) return { erro: "Escreva uma descrição." };
  if (valor === null) return { erro: "Valor inválido. Use apenas números." };
  if (tipo !== "entrada" && tipo !== "saida") return { erro: "Tipo inválido." };

  const { error } = await supabase.from("movimentos").insert({
    user_id: user.id,
    tipo,
    descricao,
    valor,
    categoria: String(formData.get("categoria") ?? "").trim() || "Geral",
    data: String(formData.get("data") ?? "") || undefined,
  });

  if (error) return { erro: error.message };

  revalidatePath("/painel");
  revalidatePath("/painel/financeiro");
  return { ok: `${tipo === "entrada" ? "Entrada" : "Saída"} registrada.` };
}

export async function removerMovimento(formData: FormData) {
  const { supabase, user } = await usuario();
  if (!user) return;

  await supabase
    .from("movimentos")
    .delete()
    .eq("id", String(formData.get("id")))
    .eq("user_id", user.id);

  revalidatePath("/painel");
  revalidatePath("/painel/financeiro");
}

/* ---------------- campanhas ---------------- */

export async function adicionarCampanha(
  _estado: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { supabase, user } = await usuario();
  if (!user) return { erro: "Sessão expirada. Entre de novo." };

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { erro: "Dê um nome à campanha." };

  const investimento = paraNumero(formData.get("investimento"));
  const receita = paraNumero(formData.get("receita"));
  if (investimento === null || receita === null) {
    return { erro: "Investimento e receita precisam ser números." };
  }

  const { error } = await supabase.from("campanhas").insert({
    user_id: user.id,
    nome,
    plataforma: String(formData.get("plataforma") ?? "Facebook Ads"),
    status: String(formData.get("status") ?? "ativa"),
    investimento,
    receita,
    leads_gerados: Number(formData.get("leads_gerados") ?? 0) || 0,
    vendas: Number(formData.get("vendas") ?? 0) || 0,
  });

  if (error) return { erro: error.message };

  revalidatePath("/painel");
  revalidatePath("/painel/campanhas");
  return { ok: "Campanha registrada." };
}

export async function removerCampanha(formData: FormData) {
  const { supabase, user } = await usuario();
  if (!user) return;

  await supabase
    .from("campanhas")
    .delete()
    .eq("id", String(formData.get("id")))
    .eq("user_id", user.id);

  revalidatePath("/painel");
  revalidatePath("/painel/campanhas");
}

/* ---------------- leads ---------------- */

export async function adicionarLead(
  _estado: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { supabase, user } = await usuario();
  if (!user) return { erro: "Sessão expirada. Entre de novo." };

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { erro: "O lead precisa de um nome." };

  const valorEstimado = paraNumero(formData.get("valor_estimado"));
  if (valorEstimado === null) return { erro: "Valor estimado inválido." };

  const { error } = await supabase.from("leads").insert({
    user_id: user.id,
    nome,
    email: String(formData.get("email") ?? "").trim() || null,
    telefone: String(formData.get("telefone") ?? "").trim() || null,
    nicho: String(formData.get("nicho") ?? "").trim() || "Geral",
    origem: String(formData.get("origem") ?? "").trim() || null,
    status: String(formData.get("status") ?? "novo"),
    valor_estimado: valorEstimado,
  });

  if (error) return { erro: error.message };

  revalidatePath("/painel/leads");
  return { ok: "Lead adicionado." };
}

export async function mudarStatusLead(formData: FormData) {
  const { supabase, user } = await usuario();
  if (!user) return;

  await supabase
    .from("leads")
    .update({ status: String(formData.get("status")) })
    .eq("id", String(formData.get("id")))
    .eq("user_id", user.id);

  revalidatePath("/painel/leads");
}

export async function removerLead(formData: FormData) {
  const { supabase, user } = await usuario();
  if (!user) return;

  await supabase
    .from("leads")
    .delete()
    .eq("id", String(formData.get("id")))
    .eq("user_id", user.id);

  revalidatePath("/painel/leads");
}
