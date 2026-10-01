import Link from "next/link";
import { redirect } from "next/navigation";
import { resetPasswordAction } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/auth-form";
import { getSession } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Redefinir senha" };
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (code)
    redirect(
      `/auth/callback?next=/auth/redefinir-senha&code=${encodeURIComponent(code)}`,
    );
  const session = await getSession();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Redefinir senha</CardTitle>
        <CardDescription>
          Use uma senha exclusiva de pelo menos 12 caracteres.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {session && !session.demoMode ? (
          <AuthForm
            action={resetPasswordAction}
            submitLabel="Salvar nova senha"
          >
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                required
              />
            </div>
          </AuthForm>
        ) : (
          <p>
            Link expirado ou sessão ausente.{" "}
            <Link className="underline" href="/recuperar-senha">
              Solicitar novo link
            </Link>
          </p>
        )}
        <Link href="/login" className="mt-4 block text-center underline">
          Voltar ao login
        </Link>
      </CardContent>
    </Card>
  );
}
