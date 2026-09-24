"""Apoio dos programas FALSOS (nginx, certbot, systemctl, apt-get, useradd, ufw).

Cada falso registra o argv em $RAIZ/executados.jsonl (uma linha JSON por chamada) e nunca
toca nada fora de $RAIZ. O teste lê esse registro para conferir o que foi chamado e em que ordem.
Falhas forçadas: arquivos em $RAIZ/falhas/<nome>.
"""
import json
import os
import sys


def raiz():
    r = os.environ.get("RAIZ", "")
    if not r or not os.path.isabs(r) or r == "/":
        print("falso: RAIZ ausente ou inválida; recuso rodar fora da raiz de teste", file=sys.stderr)
        sys.exit(97)
    return r


def registrar(nome):
    with open(os.path.join(raiz(), "executados.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps({"programa": nome, "argv": sys.argv[1:]}, ensure_ascii=False) + "\n")


def falha(nome):
    """Conteúdo de $RAIZ/falhas/<nome>, ou None se a falha não foi pedida."""
    caminho = os.path.join(raiz(), "falhas", nome)
    if not os.path.exists(caminho):
        return None
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def real(caminho_absoluto):
    """/etc/nginx/x -> $RAIZ/etc/nginx/x (os textos gerados usam sempre caminhos de produção)."""
    return os.path.join(raiz(), caminho_absoluto.lstrip("/"))
