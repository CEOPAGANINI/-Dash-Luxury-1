#!/usr/bin/env python3
"""Extrai um ZIP com a extrair() do próprio agente (public/agente/v1/dash_agent.py).

  python3 tests/agente/extrair_zip.py ZIP DESTINO

É a metade Python de tests/integration/editor-para-servidor.test.ts: o teste gera o ZIP com o
editor do funil, chama este script e confere byte a byte o que saiu em DESTINO (que precisa
existir e estar vazio). Não é um teste do unittest (o nome não começa com "test").

Imprime UMA linha JSON e sai 0 nos dois casos:
  {"ok": true, "arquivos": N, "bytes": TOTAL, "limiteZip": LIM["zip"]}
  {"ok": false, "codigo": "zip_nome", "detalhe": "..."}   (a Recusa do agente)
"""
import importlib.util
import json
import os
import sys

sys.dont_write_bytecode = True  # nada de __pycache__ dentro de public/ (a pasta é servida pela Vercel)

AQUI = os.path.dirname(os.path.abspath(__file__))
AGENTE = os.path.join(AQUI, "..", "..", "public", "agente", "v1", "dash_agent.py")


def carregar_agente():
    spec = importlib.util.spec_from_file_location("dash_agent_extrair_zip", AGENTE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main(argv):
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    agente = carregar_agente()
    try:
        n, total = agente.extrair(argv[1], argv[2])
    except agente.Recusa as e:
        print(json.dumps({"ok": False, "codigo": e.codigo, "detalhe": str(e)}, ensure_ascii=False))
        return 0
    print(json.dumps({"ok": True, "arquivos": n, "bytes": total, "limiteZip": agente.LIM["zip"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
