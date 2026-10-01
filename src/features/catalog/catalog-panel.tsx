"use client";

import {
  cloneElement,
  isValidElement,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  adjustStockAction,
  archiveCatalogAction,
  saveCategoryAction,
  saveProductAction,
  type CatalogResult,
} from "./actions";
import type { CatalogCategory, CatalogData, CatalogProduct } from "./queries";

type Mode = "products" | "categories" | "inventory";
const fieldClass =
  "min-h-11 w-full rounded-none border border-input bg-background px-3 text-sm";
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: ["BRL", "EUR"].includes(currency) ? currency : "BRL",
  }).format(cents / 100);
const decimal = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
const TYPES: Record<string, string> = {
  physical: "Físico",
  digital: "Digital",
  service: "Serviço",
  subscription: "Assinatura",
};
const STATUS: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};
const TITLES: Record<Mode, string> = {
  products: "Produtos",
  categories: "Categorias",
  inventory: "Estoque",
};

export function CatalogPanel({
  data,
  mode,
}: {
  data: CatalogData;
  mode: Mode;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const complete = useCallback((message: string) => {
    setNotice(message);
    setEditing(null);
  }, []);
  const product = data.products.find((p) => p.id === editing);
  const category = data.categories.find((c) => c.id === editing);
  const matches = (name: string, slug = "") =>
    `${name} ${slug}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR"));
  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl font-semibold">{TITLES[mode]}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {mode === "inventory"
              ? "Saldos reais e ajustes manuais registrados com histórico."
              : "Cadastre e organize os produtos da sua operação. Nenhum exemplo é gravado como dado real."}
          </p>
        </div>
        {data.status === "ready" && data.canManage && mode !== "inventory" && (
          <Button
            className="min-h-11 rounded-none"
            onClick={() => {
              setNotice("");
              setEditing("new");
            }}
          >
            {mode === "products" ? "Novo produto" : "Nova categoria"}
          </Button>
        )}
      </header>
      <nav aria-label="Catálogo" className="flex flex-wrap gap-2">
        {(["products", "categories", "inventory"] as const).map((tab) => (
          <Button
            asChild
            key={tab}
            variant={tab === mode ? "default" : "outline"}
            className="min-h-11 rounded-none"
          >
            <Link
              href={`/catalogo/${tab === "products" ? "produtos" : tab === "categories" ? "categorias" : "estoque"}`}
            >
              {TITLES[tab]}
            </Link>
          </Button>
        ))}
      </nav>
      {notice && (
        <p role="status" className="border bg-card p-3 text-sm">
          {notice}
        </p>
      )}
      {data.status !== "ready" ? (
        <div role="status" className="border bg-card p-5">
          <p>
            {data.status === "error"
              ? "A consulta ao catálogo falhou. Recarregue para tentar novamente; seus registros não foram apagados."
              : "Conecte o banco da operação antes de cadastrar produtos."}
          </p>
          <Button asChild variant="outline" className="mt-3 rounded-none">
            <Link href="/configuracoes/diagnosticos">Ver diagnóstico</Link>
          </Button>
        </div>
      ) : (
        <>
          {!data.canManage && (
            <p className="text-muted-foreground text-sm">
              Sua função permite consultar. Para editar, é necessário ser dono,
              administrador, marketing ou financeiro.
            </p>
          )}
          {editing && data.canManage && (
            <section className="border bg-card p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  {editing === "new"
                    ? mode === "products"
                      ? "Cadastrar produto"
                      : "Cadastrar categoria"
                    : "Editar cadastro"}
                </h2>
                <Button
                  variant="outline"
                  className="rounded-none"
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </Button>
              </div>
              {mode === "products" ? (
                <ProductForm
                  key={editing}
                  data={data}
                  product={product}
                  onComplete={complete}
                />
              ) : (
                <CategoryForm
                  key={editing}
                  data={data}
                  category={category}
                  onComplete={complete}
                />
              )}
            </section>
          )}
          {mode === "inventory" ? (
            <InventoryPanel data={data} onComplete={setNotice} />
          ) : (
            <>
              <label className="block max-w-md space-y-2 text-sm">
                Buscar por nome ou endereço
                <Input
                  className="min-h-11 rounded-none"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar no catálogo"
                />
              </label>
              <p className="text-muted-foreground text-xs">
                Até 200{" "}
                {mode === "products"
                  ? "produtos mais recentemente alterados"
                  : "categorias"}
                . Arquivar preserva o histórico e retira o registro das novas
                publicações.
              </p>
              <Table
                headers={
                  mode === "products"
                    ? ["Produto", "Tipo", "Preço", "Estado", "Ações"]
                    : ["Categoria", "Endereço", "Loja", "Ações"]
                }
              >
                {mode === "products"
                  ? data.products
                      .filter((p) => matches(p.name, p.slug))
                      .map((p) => (
                        <tr key={p.id}>
                          <Cell>
                            <span className="font-medium">{p.name}</span>
                            <span className="text-muted-foreground mt-1 block text-xs">
                              {p.slug}
                            </span>
                          </Cell>
                          <Cell>{TYPES[p.type]}</Cell>
                          <Cell>
                            {money(
                              p.promoPriceCents ?? p.priceCents,
                              p.currency,
                            )}
                          </Cell>
                          <Cell>{STATUS[p.status]}</Cell>
                          <Cell>
                            {data.canManage && (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  className="rounded-none"
                                  onClick={() => setEditing(p.id)}
                                >
                                  Editar
                                </Button>
                                <ArchiveButton
                                  type="product"
                                  record={p}
                                  onComplete={complete}
                                />
                              </div>
                            )}
                          </Cell>
                        </tr>
                      ))
                  : data.categories
                      .filter((c) => matches(c.name, c.slug))
                      .map((c) => (
                        <tr key={c.id}>
                          <Cell>{c.name}</Cell>
                          <Cell>{c.slug}</Cell>
                          <Cell>
                            {data.stores.find((s) => s.id === c.storeId)
                              ?.name ?? "Toda a operação"}
                          </Cell>
                          <Cell>
                            {data.canManage && (
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  className="rounded-none"
                                  onClick={() => setEditing(c.id)}
                                >
                                  Editar
                                </Button>
                                <ArchiveButton
                                  type="category"
                                  record={c}
                                  onComplete={complete}
                                />
                              </div>
                            )}
                          </Cell>
                        </tr>
                      ))}
              </Table>
              {(mode === "products" ? data.products : data.categories)
                .length === 0 && (
                <p className="text-muted-foreground border p-5 text-sm">
                  {mode === "products"
                    ? "Nenhum produto cadastrado. Crie um produto, ative-o e selecione-o no criador de checkout."
                    : "Nenhuma categoria cadastrada. Crie uma categoria e vincule os produtos pelo cadastro."}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ProductForm({
  data,
  product,
  onComplete,
}: {
  data: CatalogData;
  product?: CatalogProduct;
  onComplete: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(saveProductAction, null);
  const [version] = useState(product?.version ?? "");
  useEffect(() => {
    if (state?.ok) onComplete(state.message);
  }, [state, onComplete]);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <input type="hidden" name="version" value={version} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome">
          <Input
            className={fieldClass}
            name="name"
            required
            maxLength={200}
            defaultValue={product?.name}
          />
        </Field>
        <Field label="Endereço (slug)">
          <Input
            className={fieldClass}
            name="slug"
            maxLength={160}
            defaultValue={product?.slug}
            placeholder="Gerado pelo nome se ficar vazio"
          />
        </Field>
        <Field label="Tipo">
          <select
            className={fieldClass}
            name="type"
            defaultValue={product?.type ?? "physical"}
          >
            {Object.entries(TYPES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select
            className={fieldClass}
            name="status"
            defaultValue={product?.status ?? "draft"}
          >
            {Object.entries(STATUS).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Moeda">
          <select
            className={fieldClass}
            name="currency"
            defaultValue={product?.currency ?? "BRL"}
          >
            <option value="BRL">BRL — Real</option>
            <option value="EUR">EUR — Euro (Broski)</option>
          </select>
        </Field>
        <Field label="SKU">
          <Input
            className={fieldClass}
            name="sku"
            maxLength={100}
            defaultValue={product?.sku}
          />
        </Field>
        <Field label="Preço normal">
          <Input
            className={fieldClass}
            name="price"
            inputMode="decimal"
            required
            defaultValue={decimal(product?.priceCents)}
            placeholder="129,90"
          />
        </Field>
        <Field label="Preço promocional (opcional)">
          <Input
            className={fieldClass}
            name="promoPrice"
            inputMode="decimal"
            defaultValue={decimal(product?.promoPriceCents)}
          />
        </Field>
        <Field label="Custo unitário (opcional)">
          <Input
            className={fieldClass}
            name="cost"
            inputMode="decimal"
            defaultValue={decimal(product?.costCents)}
          />
        </Field>
        <StoreField stores={data.stores} selected={product?.storeId} />
        <Field label="URL HTTPS da imagem">
          <Input
            className={fieldClass}
            name="mainImageUrl"
            type="url"
            defaultValue={product?.mainImageUrl}
          />
        </Field>
        <Field label="URL HTTPS de entrega digital">
          <Input
            className={fieldClass}
            name="deliveryUrl"
            type="url"
            defaultValue={product?.deliveryUrl}
          />
        </Field>
      </div>
      <Field label="Descrição curta">
        <textarea
          className={`${fieldClass} min-h-20 py-3`}
          name="shortDescription"
          maxLength={500}
          defaultValue={product?.shortDescription}
        />
      </Field>
      <Field label="Descrição">
        <textarea
          className={`${fieldClass} min-h-28 py-3`}
          name="description"
          maxLength={10_000}
          defaultValue={product?.description}
        />
      </Field>
      <fieldset className="border p-3">
        <legend className="px-1 text-sm">Categorias</legend>
        {data.categories.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.categories.map((category) => (
              <label
                className="flex min-h-11 items-center gap-2 text-sm"
                key={category.id}
              >
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={category.id}
                  defaultChecked={product?.categoryIds.includes(category.id)}
                />
                {category.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Cadastre categorias na aba correspondente.
          </p>
        )}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="trackInventory"
            defaultChecked={product?.trackInventory}
          />
          Controlar estoque deste produto
        </label>
        <Field label="Alerta de estoque mínimo">
          <Input
            className={fieldClass}
            name="minStockAlert"
            type="number"
            min={0}
            max={1_000_000}
            defaultValue={product?.minStockAlert ?? ""}
          />
        </Field>
      </div>
      <p className="text-muted-foreground text-sm">
        O estoque começa em zero e é alterado com histórico na aba Estoque. O
        Broski recebe apenas EUR e pagamentos únicos; produtos BRL e assinaturas
        não podem usar esse gateway.
      </p>
      <Result state={state} />
      <Button className="min-h-11 rounded-none" disabled={pending}>
        {pending ? "Salvando…" : product ? "Salvar produto" : "Criar produto"}
      </Button>
    </form>
  );
}

function CategoryForm({
  data,
  category,
  onComplete,
}: {
  data: CatalogData;
  category?: CatalogCategory;
  onComplete: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(saveCategoryAction, null);
  const [version] = useState(category?.version ?? "");
  useEffect(() => {
    if (state?.ok) onComplete(state.message);
  }, [state, onComplete]);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={category?.id ?? ""} />
      <input type="hidden" name="version" value={version} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome">
          <Input
            className={fieldClass}
            name="name"
            required
            maxLength={200}
            defaultValue={category?.name}
          />
        </Field>
        <Field label="Endereço (slug)">
          <Input
            className={fieldClass}
            name="slug"
            defaultValue={category?.slug}
            placeholder="Gerado pelo nome se ficar vazio"
          />
        </Field>
        <StoreField stores={data.stores} selected={category?.storeId} />
        <Field label="URL HTTPS da imagem">
          <Input
            className={fieldClass}
            name="imageUrl"
            type="url"
            defaultValue={category?.imageUrl}
          />
        </Field>
      </div>
      <Field label="Descrição">
        <textarea
          className={`${fieldClass} min-h-24 py-3`}
          name="description"
          maxLength={2000}
          defaultValue={category?.description}
        />
      </Field>
      <Result state={state} />
      <Button className="min-h-11 rounded-none" disabled={pending}>
        {pending ? "Salvando…" : "Salvar categoria"}
      </Button>
    </form>
  );
}

function ArchiveButton({
  type,
  record,
  onComplete,
}: {
  type: "product" | "category";
  record: { id: string; name: string; version: string };
  onComplete: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(archiveCatalogAction, null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (state?.ok) onComplete(state.message);
  }, [state, onComplete]);
  if (!confirmed)
    return (
      <Button
        variant="outline"
        className="rounded-none"
        onClick={() => setConfirmed(true)}
      >
        Arquivar
      </Button>
    );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={record.id} />
      <input type="hidden" name="version" value={record.version} />
      <input type="hidden" name="type" value={type} />
      <p className="text-sm">Arquivar {record.name}?</p>
      <div className="flex gap-2">
        <Button className="rounded-none" disabled={pending}>
          {pending ? "Arquivando…" : "Confirmar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-none"
          onClick={() => setConfirmed(false)}
        >
          Cancelar
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

function InventoryPanel({
  data,
  onComplete,
}: {
  data: CatalogData;
  onComplete: (message: string) => void;
}) {
  const tracked = data.products.filter((p) => p.trackInventory);
  const options = tracked.flatMap((p) => [
    {
      id: p.id,
      productId: p.id,
      variantId: null,
      name: `${p.name} — saldo base`,
      stock: p.stockQuantity,
      version: p.version,
    },
    ...p.variants.map((v) => ({
      id: v.id,
      productId: p.id,
      variantId: v.id,
      name: `${p.name} — ${v.name}`,
      stock: v.stock,
      version: v.version,
    })),
  ]);
  const [selected, setSelected] = useState(options[0]?.id ?? "");
  const target = options.find((option) => option.id === selected) ?? options[0];
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        O saldo base e cada variação são separados. Estes são movimentos
        manuais; não presumimos baixas automáticas por vendas. Até 200 produtos,
        1.000 variações ativas e 50 movimentos recentes.
      </p>
      <Table headers={["Produto / variação", "Saldo", "Mínimo", "Estado"]}>
        {tracked.flatMap((p) => [
          <tr key={p.id}>
            <Cell>{p.name} — base</Cell>
            <Cell>{p.stockQuantity}</Cell>
            <Cell>{p.minStockAlert ?? "Não definido"}</Cell>
            <Cell>
              {p.stockQuantity === 0
                ? "Esgotado"
                : p.minStockAlert !== null && p.stockQuantity <= p.minStockAlert
                  ? "Abaixo do mínimo"
                  : "Disponível"}
            </Cell>
          </tr>,
          ...p.variants.map((v) => (
            <tr key={v.id}>
              <Cell>
                {p.name} — {v.name}
              </Cell>
              <Cell>{v.stock}</Cell>
              <Cell>—</Cell>
              <Cell>{v.stock === 0 ? "Esgotado" : "Disponível"}</Cell>
            </tr>
          )),
        ])}
      </Table>
      {tracked.length === 0 && (
        <p className="border p-4 text-sm">
          Nenhum produto com estoque controlado. Ative a opção no cadastro do
          produto.
        </p>
      )}
      {data.canManage && target && (
        <section className="space-y-4 border bg-card p-4">
          <h2 className="text-lg font-semibold">Registrar movimento</h2>
          <Field label="Produto ou variação">
            <select
              className={fieldClass}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.stock})
                </option>
              ))}
            </select>
          </Field>
          <StockForm
            key={`${target.id}:${target.version}`}
            target={target}
            onComplete={onComplete}
          />
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Histórico de movimentos</h2>
        <Table
          headers={["Data", "Produto", "Quantidade", "Motivo", "Observação"]}
        >
          {data.movements.map((movement) => (
            <tr key={movement.id}>
              <Cell>{movement.date.replace("T", " ").slice(0, 19)} UTC</Cell>
              <Cell>
                {movement.product}
                {movement.variant ? ` — ${movement.variant}` : ""}
              </Cell>
              <Cell>
                {movement.quantity > 0 ? "+" : ""}
                {movement.quantity}
              </Cell>
              <Cell>{movement.reason}</Cell>
              <Cell>{movement.note}</Cell>
            </tr>
          ))}
        </Table>
        {data.movements.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Nenhum movimento registrado.
          </p>
        )}
      </section>
    </div>
  );
}

function StockForm({
  target,
  onComplete,
}: {
  target: { productId: string; variantId: string | null; version: string };
  onComplete: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(adjustStockAction, null);
  useEffect(() => {
    if (state?.ok) onComplete(state.message);
  }, [state, onComplete]);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="productId" value={target.productId} />
      <input type="hidden" name="variantId" value={target.variantId ?? ""} />
      <input type="hidden" name="version" value={target.version} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Quantidade (+ entrada / − saída)">
          <Input
            className={fieldClass}
            name="quantity"
            type="number"
            step={1}
            min={-1_000_000}
            max={1_000_000}
            required
            placeholder="10 ou -2"
          />
        </Field>
        <Field label="Motivo">
          <select className={fieldClass} name="reason">
            <option value="restock">Reposição</option>
            <option value="adjustment">Ajuste</option>
            <option value="return">Devolução</option>
          </select>
        </Field>
      </div>
      <Field label="Observação obrigatória">
        <Input
          className={fieldClass}
          name="note"
          required
          minLength={3}
          maxLength={500}
          placeholder="Ex.: reposição recebida do fornecedor"
        />
      </Field>
      <Result state={state} />
      <Button className="min-h-11 rounded-none" disabled={pending}>
        {pending ? "Registrando…" : "Registrar movimento"}
      </Button>
    </form>
  );
}

function Result({ state }: { state: CatalogResult | null }) {
  return state ? (
    <p role={state.ok ? "status" : "alert"} className="border p-3 text-sm">
      {state.message}
    </p>
  ) : null;
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <label className="block space-y-2 text-sm" htmlFor={id}>
      <span>{label}</span>
      <span className="block">
        {isValidElement(children)
          ? cloneElement(children as React.ReactElement<{ id: string }>, { id })
          : children}
      </span>
    </label>
  );
}
function StoreField({
  stores,
  selected,
}: {
  stores: CatalogData["stores"];
  selected?: string | null;
}) {
  return (
    <Field label="Loja">
      <select
        className={fieldClass}
        name="storeId"
        defaultValue={selected ?? ""}
      >
        <option value="">Toda a operação</option>
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div
      className="max-w-full overflow-x-auto border"
      tabIndex={0}
      role="region"
      aria-label="Tabela de catálogo com rolagem horizontal"
    >
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="bg-card">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="border-b px-3 py-3 font-medium"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="max-w-sm border-b px-3 py-3 align-top break-words">
      {children}
    </td>
  );
}
