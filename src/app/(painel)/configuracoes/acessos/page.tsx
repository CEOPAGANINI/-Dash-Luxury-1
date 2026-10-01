import { getWorkspaceMembers } from "@/features/settings/operation";
import {
  saveMemberAction,
  switchOperationAction,
} from "@/features/settings/operation-actions";
import { SettingsForm } from "@/features/settings/settings-form";
export const metadata = { title: "Equipe e permissões" };
export default async function Page() {
  const { rows, access, operations } = await getWorkspaceMembers();
  const canManage = ["owner", "admin"].includes(access.role);
  return (
    <div className="cfg-devmode">
      <header className="cfg-cabecalho">
        <div>
          <h2>Equipe e permissões</h2>
          <p>
            Sua função: {access.role}. Cada conta acessa somente operações das
            quais é membro ativo.
          </p>
        </div>
      </header>
      <div className="cfg-card cfg-table-wrap">
        <table>
          <caption className="sr-only">Membros da operação</caption>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Função</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>{x.name ?? "—"}</td>
                <td>{x.email}</td>
                <td>{x.role}</td>
                <td>{x.active ? "Ativo" : "Suspenso"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {operations.length > 1 && (
        <section className="cfg-card">
          <h3>Operação selecionada</h3>
          <SettingsForm
            action={switchOperationAction}
            label="Usar esta operação"
          >
            <label>
              Operação
              <select name="workspaceId" defaultValue={access.workspaceId}>
                {operations.map((operation) => (
                  <option key={operation.id} value={operation.id}>
                    {operation.name}
                  </option>
                ))}
              </select>
            </label>
          </SettingsForm>
        </section>
      )}
      {canManage && (
        <section className="cfg-card">
          <h3>Adicionar ou atualizar acesso</h3>
          <p>
            Informe uma conta que já entrou no dashboard. Proprietário não é
            transferido aqui. Suspender revoga o acesso à operação; os dados são
            preservados.
          </p>
          <SettingsForm action={saveMemberAction} label="Atualizar acesso">
            <div className="cfg-fields">
              <label>
                E-mail
                <input type="email" name="email" required autoComplete="off" />
              </label>
              <label>
                Função
                <select name="role" defaultValue="viewer">
                  {[
                    ...(access.role === "owner" ? ["admin"] : []),
                    "finance",
                    "marketing",
                    "support",
                    "analyst",
                    "viewer",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Estado
                <select name="active">
                  <option value="true">Ativo</option>
                  <option value="false">Suspenso</option>
                </select>
              </label>
            </div>
          </SettingsForm>
        </section>
      )}
      <section className="cfg-card">
        <h3>O que cada função permite</h3>
        <p>
          Owner/admin: configuração e integrações. Finance: checkout e fretes.
          Marketing: funil, campanhas e pixels. Support: clientes e avaliações.
          Analyst/viewer: leitura. Permissões não substituem a autenticação.
        </p>
      </section>
    </div>
  );
}
