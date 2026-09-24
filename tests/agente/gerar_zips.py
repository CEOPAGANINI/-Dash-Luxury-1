#!/usr/bin/env python3
"""Gera os ZIPs dos testes de extração do agente (bons, maliciosos e quebrados).

  python3 tests/agente/gerar_zips.py DESTINO     grava um .zip por caso em DESTINO

Cada caso é {"nome": (bytes do zip, codigo_esperado ou None)}. Os maliciosos são montados com
o zipfile e depois adulterados byte a byte no cabeçalho, porque o zipfile não escreve ZIP
cifrado, symlink nem tamanho mentiroso de propósito.
"""
import io
import os
import stat
import struct
import sys
import zipfile

INDEX = b"<!doctype html><title>Loja</title><h1>Oferta</h1>\n"


def montar(entradas, metodo=zipfile.ZIP_DEFLATED):
    """entradas: lista de (nome, bytes) ou (ZipInfo, bytes)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", metodo) as z:
        for nome, dados in entradas:
            if isinstance(nome, zipfile.ZipInfo):
                z.writestr(nome, dados)
            else:
                z.writestr(nome, dados)
    return buf.getvalue()


def _cabecalhos(b):
    """Posições dos cabeçalhos locais (PK\\3\\4) e centrais (PK\\1\\2)."""
    locais, centrais, i = [], [], 0
    while True:
        i = b.find(b"PK\x03\x04", i)
        if i < 0:
            break
        locais.append(i)
        i += 4
    i = 0
    while True:
        i = b.find(b"PK\x01\x02", i)
        if i < 0:
            break
        centrais.append(i)
        i += 4
    return locais, centrais


def adulterar_flag(zbytes, bit):
    b = bytearray(zbytes)
    locais, centrais = _cabecalhos(b)
    for i in locais:
        struct.pack_into("<H", b, i + 6, struct.unpack_from("<H", b, i + 6)[0] | bit)
    for i in centrais:
        struct.pack_into("<H", b, i + 8, struct.unpack_from("<H", b, i + 8)[0] | bit)
    return bytes(b)


def adulterar_tamanho(zbytes, nome, novo):
    """Troca o tamanho descomprimido declarado (local e central) de uma entrada."""
    b = bytearray(zbytes)
    locais, centrais = _cabecalhos(b)
    for i in locais:
        n = struct.unpack_from("<H", b, i + 26)[0]
        if bytes(b[i + 30 : i + 30 + n]).decode() == nome:
            struct.pack_into("<I", b, i + 22, novo)
    for i in centrais:
        n = struct.unpack_from("<H", b, i + 28)[0]
        if bytes(b[i + 46 : i + 46 + n]).decode() == nome:
            struct.pack_into("<I", b, i + 24, novo)
    return bytes(b)


def info(nome, modo=None):
    zi = zipfile.ZipInfo(nome, date_time=(2026, 9, 23, 12, 0, 0))
    zi.compress_type = zipfile.ZIP_DEFLATED
    if modo is not None:
        zi.external_attr = modo << 16
    return zi


def casos():
    c = {}
    c["bom"] = (
        montar([
            ("index.html", INDEX),
            ("css/estilo.css", b"body{margin:0}"),
            ("js/app.3f9a1c2b.js", b"console.log(1)"),
            ("img/foto.png", b"\x89PNG\r\n\x1a\n" + b"0" * 100),
            ("obrigado/index.html", b"<p>Obrigado</p>"),
            ("termos.html", b"<p>Termos</p>"),
        ]),
        None,
    )
    c["pasta_raiz_e_lixo"] = (
        montar([
            ("site/", b""),
            ("site/index.html", INDEX),
            ("site/css/estilo.css", b"body{}"),
            ("site/.DS_Store", b"x"),
            ("site/Thumbs.db", b"x"),
            ("site/.htaccess", b"Deny from all"),
            ("site/css/._estilo.css", b"x"),
            ("site/desktop.ini", b"x"),
            ("__MACOSX/site/._index.html", b"x"),
        ]),
        None,
    )
    c["traversal"] = (montar([("index.html", INDEX), ("../fora.html", b"x")]), "zip_nome")
    c["absoluto"] = (montar([("index.html", INDEX), ("/etc/cron.d/x.txt", b"x")]), "zip_nome")
    c["contrabarra"] = (montar([("index.html", INDEX), ("a\\b.html", b"x")]), "zip_nome")
    c["symlink"] = (montar([("index.html", INDEX), (info("link.html", stat.S_IFLNK | 0o777), b"/etc/passwd")]), "zip_link")
    c["cifrado"] = (adulterar_flag(montar([("index.html", INDEX)]), 0x1), "zip_cifrado")
    c["dotfile"] = (montar([("index.html", INDEX), (".env", b"SEGREDO=1")]), "zip_nome")
    c["dotpasta"] = (montar([("index.html", INDEX), (".git/config.txt", b"x")]), "zip_nome")
    c["reservado"] = (montar([("index.html", INDEX), (".dash-release.json", b"{}")]), "zip_nome")
    c["php"] = (montar([("index.html", INDEX), ("script.php", b"<?php system($_GET['c']);")]), "zip_extensao")
    c["sem_extensao"] = (montar([("index.html", INDEX), ("LEIAME", b"x")]), "zip_extensao")
    # O zipfile marca como UTF-8 (bit 11) todo nome fora do ASCII: em NFC passa (é o que o editor do
    # funil grava); em NFD (ZIP do macOS) não casaria com o link do HTML.
    c["acento_nfc"] = (montar([("index.html", INDEX), ("img/promoção.png", b"x"), ("verão/oferta.html", INDEX)]), None)
    c["acento"] = (montar([("index.html", INDEX), ("promoc\u0327a\u0303o.png", b"x")]), "zip_nome")
    c["sem_index"] = (montar([("pagina.html", INDEX)]), "zip_sem_index")
    c["duplicado_caixa"] = (montar([("index.html", INDEX), ("Foto.PNG", b"a"), ("foto.png", b"b")]), "zip_duplicado")
    c["mentindo_tamanho"] = (adulterar_tamanho(montar([("index.html", INDEX), ("grande.txt", b"A" * 200_000)]), "grande.txt", 10), "zip_corrompido")
    c["bomba_arquivo"] = (montar([("index.html", INDEX), ("zeros.txt", b"\0" * (21 << 20))]), "zip_bomba")
    c["bomba_total"] = (
        montar([("index.html", INDEX)] + [(f"parte{i}.txt", b"\0" * (19 << 20)) for i in range(3)]),
        "zip_bomba",
    )
    c["muitos_arquivos"] = (
        montar([("index.html", INDEX)] + [(f"p/{i}.txt", b"") for i in range(2000)], zipfile.ZIP_STORED),
        "zip_muitos_arquivos",
    )
    c["nao_zip"] = (b"isto nao e um zip" * 10, "zip_invalido")
    return c


if __name__ == "__main__":
    destino = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(destino, exist_ok=True)
    for nome, (dados, _codigo) in casos().items():
        with open(os.path.join(destino, nome + ".zip"), "wb") as f:
            f.write(dados)
    print(f"{len(casos())} zips em {destino}")
