"use client";

import { useState } from "react";

import { SolarIcon } from "@/components/command-layer/solar-icon";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import styles from "./command-layer-design-system.module.css";

const surfaces = [
  ["Canvas", "--cl-canvas", "Fundo externo"],
  ["Chassis", "--cl-chassis", "Moldura dos painéis"],
  ["Display", "--cl-screen", "Superfície rebaixada"],
  ["Cavidade", "--cl-well", "Trilhos e seletores"],
  ["Elevada", "--cl-raised", "Controles e menus"],
  ["Terminal", "--cl-terminal", "Leituras técnicas"],
] as const;

const signals = [
  ["Ação", "--cl-accent", "Ações e seleção"],
  ["Sucesso", "--cl-success", "Resultado confirmado"],
  ["Aviso", "--cl-warning", "Atenção necessária"],
  ["Informação", "--cl-info", "Orientação e contexto"],
  ["Erro", "--cl-danger", "Falha a corrigir"],
  ["Série violeta", "--cl-violet", "Distinção em gráficos"],
  ["Série rosa", "--cl-pink", "Distinção em gráficos"],
] as const;

const sections = [
  ["materiais", "Materiais"],
  ["paleta", "Cores"],
  ["tipografia", "Tipografia"],
  ["componentes", "Componentes"],
] as const;

export function CommandLayerDesignSystem() {
  const [feedback, setFeedback] = useState("");
  const [name, setName] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [saved, setSaved] = useState(false);

  async function copyToken(token: string) {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(`var(${token})`);
      setFeedback(`Variável ${token} copiada.`);
    } catch {
      setFeedback(`Não foi possível copiar. Selecione o texto: var(${token}).`);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Biblioteca de interface</p>
          <h2>CommandLayer</h2>
          <p className={styles.intro}>
            Materiais de um painel físico. Clareza de uma interface digital.
            Este catálogo usa os mesmos componentes e tokens do dashboard.
          </p>
        </div>
        <div className={styles.themeControl}>
          <ThemeToggle />
          <span>As amostras acompanham o tema do painel.</span>
        </div>
      </header>

      <nav className={styles.navigation} aria-label="Seções do design system">
        {sections.map(([id, label]) => (
          <a key={id} href={`#cl-${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <section
        id="cl-materiais"
        className={styles.section}
        aria-labelledby="cl-material-title"
      >
        <div className={styles.sectionHeading}>
          <h2 id="cl-material-title">Profundidade com propósito</h2>
          <p>
            Molduras elevadas para agrupar. Displays rebaixados para ler. Cor
            para orientar.
          </p>
        </div>
        <div className={styles.materials}>
          <Card>
            <CardHeader>
              <SolarIcon name="layers" className={styles.accent} size={24} />
              <CardTitle>
                <h3>Painel em duas camadas</h3>
              </CardTitle>
              <CardDescription>
                Borda externa, moldura de 4px e brilho superior fino.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={styles.materialReadout}>
                <span>Display rebaixado</span>
                <code>--cl-shadow-inset</code>
                <p>
                  A informação fica dentro do material, não sobre uma caixa
                  plana.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <SolarIcon name="palette" className={styles.accent} size={24} />
              <CardTitle>
                <h3>Dois temas, uma linguagem</h3>
              </CardTitle>
              <CardDescription>
                Contraste, camadas e estados preservados nos temas claro e
                escuro.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.materialRules}>
              <div>
                <span>Controles</span>
                <code>4px</code>
              </div>
              <div>
                <span>Superfície interna</span>
                <code>8px</code>
              </div>
              <div>
                <span>Painéis</span>
                <code>12px</code>
              </div>
              <div>
                <span>Respiro entre módulos</span>
                <code>24–32px</code>
              </div>
            </CardContent>
          </Card>
        </div>
        <p className={styles.note}>
          O tema escuro vem da referência CommandLayer. O tema claro e os
          estados operacionais são adaptações para este dashboard.
        </p>
      </section>

      <section
        id="cl-paleta"
        className={styles.section}
        aria-labelledby="cl-color-title"
      >
        <div className={styles.sectionHeading}>
          <h2 id="cl-color-title">Cores e superfícies</h2>
          <p>
            Clique para copiar a variável CSS. Seu valor muda com o tema; seu
            significado permanece.
          </p>
        </div>
        <div className={styles.swatches}>
          {surfaces.map(([label, token, description]) => (
            <button
              key={token}
              type="button"
              className={styles.swatch}
              onClick={() => void copyToken(token)}
              aria-label={`Copiar ${token}`}
            >
              <span
                className={styles.colorSample}
                style={{ background: `var(${token})` }}
                aria-hidden="true"
              />
              <span className={styles.swatchText}>
                <strong>{label}</strong>
                <code>{token}</code>
                <span>{description}</span>
              </span>
              <SolarIcon name="copy" size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className={styles.signals}>
          {signals.map(([label, token, description]) => (
            <button
              key={token}
              type="button"
              className={styles.signal}
              onClick={() => void copyToken(token)}
              aria-label={`Copiar ${token}`}
            >
              <span
                className={styles.led}
                style={{ color: `var(${token})` }}
                aria-hidden="true"
              />
              <span>
                <strong>{label}</strong>
                <span>{description}</span>
                <code>{token}</code>
              </span>
            </button>
          ))}
        </div>
        <p className={styles.feedback} role="status" aria-live="polite">
          {feedback || "As amostras mostram as cores ativas neste tema."}
        </p>
      </section>

      <section
        id="cl-tipografia"
        className={styles.section}
        aria-labelledby="cl-type-title"
      >
        <div className={styles.sectionHeading}>
          <h2 id="cl-type-title">Inter + JetBrains Mono</h2>
          <p>
            Leitura em Inter. Precisão nos controles, métricas e informações
            técnicas com JetBrains Mono.
          </p>
        </div>
        <div className={styles.typeGrid}>
          <div className={styles.typeSample}>
            <span className={styles.kicker}>Títulos e texto</span>
            <strong className={styles.typeDisplay}>
              Seu painel, com clareza.
            </strong>
            <p>
              Hierarquia sem ruído. Títulos de 24–30px, peso 500, e texto de
              leitura com 14px e altura confortável.
            </p>
            <code>Inter · tracking −0.025em nos títulos</code>
          </div>
          <div className={styles.typeSample}>
            <span className={styles.kicker}>Leituras técnicas · amostra</span>
            <strong className={styles.metricSample}>
              1.234,56 <span>MB</span>
            </strong>
            <p>
              Algarismos tabulares mantêm as colunas alinhadas. Unidades ficam
              separadas do valor.
            </p>
            <code>JetBrains Mono · 30px / 36px</code>
          </div>
        </div>
      </section>

      <section
        id="cl-componentes"
        className={styles.section}
        aria-labelledby="cl-component-title"
      >
        <div className={styles.sectionHeading}>
          <h2 id="cl-component-title">Componentes em uso</h2>
          <p>
            Demonstrações locais. Estes controles não alteram dados, não
            publicam sites e não fazem requisições ao servidor.
          </p>
        </div>
        <div className={styles.componentGrid}>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>Ações e estados</h3>
              </CardTitle>
              <CardDescription>
                Experimente os botões com mouse ou teclado.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.stack}>
              <div className={styles.controls}>
                <Button
                  onClick={() =>
                    setFeedback(
                      "Ação demonstrativa concluída. Nenhum dado foi alterado.",
                    )
                  }
                >
                  <SolarIcon name="bolt" />
                  Testar ação
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setFeedback(
                      "Ação secundária demonstrada. Nenhum dado foi alterado.",
                    )
                  }
                >
                  Secundário
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setFeedback(
                      "Ação discreta demonstrada. Nenhum dado foi alterado.",
                    )
                  }
                >
                  Discreto
                </Button>
                <Button disabled>Indisponível</Button>
                <Button loading>Carregando · exemplo</Button>
              </div>
              <div className={styles.controls} aria-label="Exemplos de estados">
                <Badge variant="success">
                  <SolarIcon name="check-circle" />
                  Concluído
                </Badge>
                <Badge variant="warning">
                  <SolarIcon name="clock-circle" />
                  Pendente
                </Badge>
                <Badge variant="info">Informação</Badge>
                <Badge variant="destructive">
                  <SolarIcon name="danger-triangle" />
                  Erro
                </Badge>
                <Badge variant="muted">Inativo</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>Formulário demonstrativo</h3>
              </CardTitle>
              <CardDescription>
                Teste uma validação sem gravar informações.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className={styles.stack}
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  const empty = name.trim().length === 0;
                  setInvalid(empty);
                  setSaved(!empty);
                }}
              >
                <div className={styles.field}>
                  <Label htmlFor="cl-demo-name">Nome de exemplo</Label>
                  <Input
                    id="cl-demo-name"
                    value={name}
                    placeholder="Minha landing page"
                    required
                    aria-invalid={invalid}
                    aria-describedby="cl-demo-help"
                    onChange={(event) => {
                      setName(event.target.value);
                      setInvalid(false);
                      setSaved(false);
                    }}
                  />
                  <p
                    id="cl-demo-help"
                    className={invalid ? styles.error : styles.help}
                  >
                    {invalid
                      ? "Digite um nome para testar a validação."
                      : "Somente nesta demonstração; nada será salvo."}
                  </p>
                </div>
                <Button type="submit" variant="outline">
                  Validar exemplo
                </Button>
                <p className={styles.success} role="status">
                  {saved ? "Exemplo validado. Nenhum dado foi salvo." : ""}
                </p>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>Abas e feedback</h3>
              </CardTitle>
              <CardDescription>
                Estados de demonstração com nomes acessíveis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="ready">
                <TabsList aria-label="Estados demonstrativos">
                  <TabsTrigger value="ready">Sucesso</TabsTrigger>
                  <TabsTrigger value="error">Erro</TabsTrigger>
                  <TabsTrigger value="loading">Loading</TabsTrigger>
                </TabsList>
                <TabsContent value="ready">
                  <Alert variant="success" role="status">
                    <SolarIcon name="check-circle" />
                    <AlertTitle>Exemplo concluído</AlertTitle>
                    <AlertDescription>
                      O resultado sempre explica o que aconteceu.
                    </AlertDescription>
                  </Alert>
                </TabsContent>
                <TabsContent value="error">
                  <Alert variant="destructive">
                    <SolarIcon name="danger-triangle" />
                    <AlertTitle>Exemplo de falha</AlertTitle>
                    <AlertDescription>
                      Explique o problema e indique como corrigi-lo. Este não é
                      um erro real do painel.
                    </AlertDescription>
                  </Alert>
                </TabsContent>
                <TabsContent value="loading">
                  <div
                    className={styles.skeletons}
                    role="status"
                    aria-label="Exemplo de carregamento"
                  >
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <span>
                      Carregamento ilustrativo; nenhuma operação em andamento.
                    </span>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>Estado vazio</h3>
              </CardTitle>
              <CardDescription>
                A ausência de dados também orienta o próximo passo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={styles.empty}>
                <SolarIcon name="folder" size={28} />
                <strong>Nenhum item nesta demonstração</strong>
                <p>
                  Explique o que aparecerá aqui antes de apresentar a ação para
                  começar.
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    setFeedback(
                      "Exemplo de próximo passo. Nenhum item foi criado.",
                    )
                  }
                >
                  Testar próximo passo
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
      <footer className={styles.footer}>
        <p>
          CommandLayer · materiais extraídos da referência, componentes
          operacionais adaptados ao dashboard.
        </p>
        <p>
          Ciano, verde, âmbar, azul, rosa e violeta mantêm seus papéis e ajustam
          o contraste ao tema.
        </p>
      </footer>
    </div>
  );
}
