import { redirect } from "next/navigation";
import MenuLateral from "@/components/MenuLateral";
import { sair } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";

export default async function LayoutPainel({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <strong>Infinity</strong>
          <span>painel</span>
        </div>

        <MenuLateral />

        <div className="rodape-lateral">
          <span className="email">{user.email}</span>
          <form action={sair}>
            <button className="botao discreto" type="submit">
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="conteudo">{children}</main>
    </div>
  );
}
