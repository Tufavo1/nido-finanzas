#!/usr/bin/env bash
# Copyright (c) 2026 Dinovance
# Verifica un APK YA COMPILADO contra la politica de seguridad (scripts/apk-security-policy.txt). Sin red; solo lee.
#
#   bash scripts/verify-apk-security.sh dist-apk/nido-release.apk
#   NIDO_CERT_SHA256=<huella sha256 del certificado de release> bash scripts/verify-apk-security.sh dist-apk/nido-release.apk
#   ALLOW_NO_V3=1 ...   # solo para revisar un APK viejo firmado sin v3 (lo marca como AVISO en vez de FALLA)
#
# Comprueba: firma valida v2 + v3, un solo firmante, que NO sea la llave de depuracion y (si se da) que sea la huella
# esperada; paquete y etiqueta; no depurable ni testOnly; targetSdk minimo; permisos EXACTOS; componentes exportados
# con lista blanca y permiso; enlaces; listener con proposito declarado; sin copias; sin trafico en claro; solo
# autoridades del sistema; sin carga dinamica de codigo en el dex; sin mapas de codigo; config de Capacitor endurecida.
# Salida: lineas OK / AVISO / FALLA y exit 1 si hay alguna FALLA.
set -euo pipefail
APK="${1:?Uso: $0 ruta/al.apk}"
[ -f "$APK" ] || { echo "FALLA no existe $APK"; exit 1; }
APK="$(cd "$(dirname "$APK")" && pwd)/$(basename "$APK")"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POLITICA="$RAIZ/scripts/apk-security-policy.txt"
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
BT="${BUILD_TOOLS:-$(ls -d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1)}"
[ -x "$BT/aapt2" ] && [ -x "$BT/apksigner" ] || { echo "FALLA no encuentro aapt2/apksigner en $BT (define ANDROID_HOME o BUILD_TOOLS)"; exit 1; }
command -v java >/dev/null || { echo "FALLA apksigner necesita java en el PATH (p. ej. JAVA_HOME=\$HOME/dev/jdk-21)"; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
"$BT/apksigner" verify --verbose --print-certs "$APK" > "$TMP/firma.txt" 2>&1 || true
"$BT/aapt2" dump badging "$APK" > "$TMP/badging.txt" 2>/dev/null
"$BT/aapt2" dump xmltree "$APK" --file AndroidManifest.xml > "$TMP/manifest.txt"
"$BT/aapt2" dump resources "$APK" > "$TMP/recursos.txt" 2>/dev/null
"$BT/zipalign" -c -P 16 4 "$APK" > "$TMP/zipalign.txt" 2>&1 && echo ok > "$TMP/zipalign.ok" || true
mkdir "$TMP/apk" && (cd "$TMP/apk" && unzip -q "$APK" 'classes*.dex' 'assets/*' 2>/dev/null || true)
for f in $(sed -n 's/.*(file) \(res\/[^ ]*\.xml\) type=XML.*/\1/p' "$TMP/recursos.txt" | sort -u); do
  safe="$(echo "$f" | tr '/' '_')"
  "$BT/aapt2" dump xmltree "$APK" --file "$f" > "$TMP/xml_$safe.txt" 2>/dev/null || true
done

python3 -I - "$TMP" "$POLITICA" "$APK" "${NIDO_CERT_SHA256:-}" "${ALLOW_NO_V3:-}" <<'PY'
import hashlib, json, os, re, sys
tmp, policy_path, apk, want_cert, allow_no_v3 = sys.argv[1:6]
fails, warns = [], []
def ok(m): print("OK " + m)
def warn(m): warns.append(m); print("AVISO " + m)
def fail(m): fails.append(m); print("FALLA " + m)
rd = lambda n: open(os.path.join(tmp, n), encoding="utf-8", errors="replace").read()

# --- politica
rows = [l.split("#")[0].split() for l in open(policy_path, encoding="utf-8")]
rows = [r for r in rows if r]
one = lambda k: next(r[1] for r in rows if r[0] == k)
pkg = one("package"); sub = lambda s: s.replace("${pkg}", pkg)
allowed = {sub(r[1]) for r in rows if r[0] == "permission"}
forbidden = {sub(r[1]) for r in rows if r[0] == "forbidden_permission"}
exported_ok = {r[1]: (None if r[2] == "-" else r[2]) for r in rows if r[0] == "exported"}
deeplinks = {r[1] for r in rows if r[0] == "deeplink"}
listener = one("listener_service")

# --- firma
s = rd("firma.txt")
if re.search(r"^Verifies$", s, re.M): ok("firma valida")
else: fail("apksigner no verifica la firma: " + s.strip().splitlines()[0] if s.strip() else "apksigner sin salida")
v2 = re.search(r"v2 scheme \(APK Signature Scheme v2\): true", s); v3 = re.search(r"v3 scheme \(APK Signature Scheme v3\): true", s)
(ok if v2 else fail)("firma v2 " + ("presente" if v2 else "AUSENTE"))
if v3: ok("firma v3 presente")
elif allow_no_v3: warn("firma v3 AUSENTE (ALLOW_NO_V3): recompila con enableV3Signing")
else: fail("firma v3 AUSENTE (build.gradle ya la activa: recompila el release)")
n = re.search(r"Number of signers: (\d+)", s)
if n and n.group(1) == "1": ok("un solo firmante")
else: fail("numero de firmantes inesperado: " + (n.group(1) if n else "?"))
dn = re.search(r"Signer #1 certificate DN: (.*)", s); dg = re.search(r"Signer #1 certificate SHA-256 digest: ([0-9a-f]{64})", s)
if dn and "Android Debug" in dn.group(1): fail("firmado con la llave PUBLICA de depuracion (CN=Android Debug)")
elif dn: ok("certificado: " + dn.group(1).strip())
if dg:
    print("INFO huella SHA-256 del certificado: " + dg.group(1))
    if want_cert:
        (ok if dg.group(1) == want_cert.lower().replace(":", "") else fail)("huella del certificado " + ("coincide con NIDO_CERT_SHA256" if dg.group(1) == want_cert.lower().replace(":", "") else "DISTINTA de NIDO_CERT_SHA256: otra llave = no actualiza la app instalada"))
    else: warn("sin NIDO_CERT_SHA256: no se comprobo que sea la MISMA llave de siempre")
h = hashlib.sha256(open(apk, "rb").read()).hexdigest(); print("INFO sha256 del APK: " + h)

# --- badging
b = rd("badging.txt")
m = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'", b)
if m and m.group(1) == pkg: ok("paquete %s versionCode %s (%s)" % (m.group(1), m.group(2), m.group(3)))
else: fail("paquete inesperado: " + (m.group(1) if m else "?"))
lab = re.search(r"^application-label:'([^']*)'", b, re.M)
(ok if lab and lab.group(1) == one("label") else fail)("etiqueta visible '%s'" % (lab.group(1) if lab else "?"))
t = re.search(r"targetSdkVersion:'(\d+)'", b); mn = int(one("min_target_sdk"))
(ok if t and int(t.group(1)) >= mn else fail)("targetSdk %s (minimo %d)" % (t.group(1) if t else "?", mn))
if re.search(r"^application-debuggable", b, re.M): fail("APK DEPURABLE (android:debuggable=true)")
else: ok("no depurable")
if re.search(r"^testOnly", b, re.M) or "testOnly='-1'" in b: fail("APK testOnly")
perms = set(re.findall(r"^uses-permission(?:-sdk-23)?: name='([^']+)'", b, re.M))
for p in sorted(perms & forbidden): fail("permiso PROHIBIDO " + p)
for p in sorted(perms - allowed - forbidden): fail("permiso no permitido " + p)
for p in sorted(allowed - perms): warn("permiso de la politica que el APK ya no pide (actualiza la politica): " + p)
if not (perms - allowed) and not (perms & forbidden): ok("permisos exactos: " + ", ".join(sorted(perms)))

# --- manifiesto (arbol de aapt2)
class E:
    def __init__(s, tag, depth): s.tag, s.depth, s.attrs, s.kids = tag, depth, {}, []
root = E("root", -1); stack = [root]
for line in rd("manifest.txt").splitlines():
    d = len(line) - len(line.lstrip()); l = line.strip()
    if l.startswith("E: "):
        e = E(l[3:].split(" ")[0], d)
        while stack[-1].depth >= d: stack.pop()
        stack[-1].kids.append(e); stack.append(e)
    elif l.startswith("A: "):
        mm = re.match(r'A: (?:http://schemas.android.com/apk/res/android:)?([A-Za-z]+)(?:\(0x[0-9a-f]+\))?=(.*)', l)
        if mm:
            v = mm.group(2); q = re.match(r'"(.*?)" \(Raw', v)
            stack[-1].attrs[mm.group(1)] = q.group(1) if q else v.strip('"')
def find(e, tag): return [k for k in e.kids if k.tag == tag]
man = find(root, "manifest")[0]; app = find(man, "application")[0]
for k, want in (("allowBackup", "false"), ("fullBackupContent", "false"), ("usesCleartextTraffic", "false")):
    (ok if app.attrs.get(k) == want else fail)("application %s=%s" % (k, app.attrs.get(k)))
for k in ("dataExtractionRules", "networkSecurityConfig"):
    (ok if k in app.attrs else fail)("application declara " + k)
if app.attrs.get("debuggable") in ("true", "0xffffffff"): fail("manifiesto con debuggable=true")
for p in find(man, "permission"):
    lvl = p.attrs.get("protectionLevel", "0x0")
    (ok if lvl in ("0x00000002", "signature") or (lvl.startswith("0x") and int(lvl, 16) & 0x2) else fail)("permiso propio %s nivel %s" % (p.attrs.get("name"), lvl))
for q in find(man, "queries"):
    for k in q.kids:
        if k.tag != "intent": fail("queries/%s no previsto" % k.tag)
bad_exp = 0
for c in [k for k in app.kids if k.tag in ("activity", "activity-alias", "service", "receiver", "provider")]:
    name = c.attrs.get("name", "?"); exp = c.attrs.get("exported")
    if exp is None and find(c, "intent-filter"): fail("%s con intent-filter sin exported explicito" % name); bad_exp += 1
    if exp == "true":
        if c.tag == "provider": fail("proveedor exportado " + name); bad_exp += 1
        elif name not in exported_ok: fail("exportado fuera de la lista blanca: " + name); bad_exp += 1
        elif exported_ok[name] and c.attrs.get("permission") != exported_ok[name]: fail("%s exportado sin el permiso %s" % (name, exported_ok[name])); bad_exp += 1
    for f in find(c, "intent-filter"):
        acts = {a.attrs.get("name") for a in find(f, "action")}; cats = {a.attrs.get("name") for a in find(f, "category")}
        if "android.intent.action.VIEW" in acts and "android.intent.category.BROWSABLE" in cats:
            data = find(f, "data"); schemes = {d.attrs.get("scheme") for d in data if "scheme" in d.attrs}; hosts = {d.attrs.get("host") for d in data if "host" in d.attrs}
            for sc in schemes:
                for ho in hosts or {None}:
                    link = "%s://%s" % (sc, ho)
                    if sc == "http": fail("enlace en claro " + link)
                    elif sc == "https" and f.attrs.get("autoVerify") not in ("true", "0xffffffff"): fail("App Link sin autoVerify " + link)
                    elif link not in deeplinks: fail("enlace no previsto " + link)
                    else: ok("enlace permitido " + link)
if not bad_exp: ok("componentes exportados: solo la lista blanca y con su permiso")
main = [k for k in app.kids if k.tag == "activity" and k.attrs.get("name") == pkg + ".MainActivity"]
(ok if main and main[0].attrs.get("taskAffinity") == "" else fail)("MainActivity con taskAffinity vacio (anti secuestro de tarea)")
ls = [k for k in app.kids if k.tag == "service" and k.attrs.get("name") == listener]
if ls:
    meta = {m.attrs.get("name"): m.attrs.get("value") for m in find(ls[0], "meta-data")}
    dft = (meta.get("android.service.notification.default_filter_types") or "").split("|")
    (ok if dft != [""] and "conversations" not in dft and "ongoing" not in dft else fail)("listener default_filter_types=" + "|".join(dft))
    (ok if "ongoing" in (meta.get("android.service.notification.disabled_filter_types") or "") else fail)("listener deshabilita notificaciones persistentes")
else: fail("no esta el listener " + listener)

# --- network security config y reglas de copia (por id de recurso)
res = rd("recursos.txt")
def res_file(attr):
    rid = app.attrs.get(attr, "").lstrip("@")
    mm = re.search(r"resource %s \S+\n\s+\(\) \(file\) (res/\S+\.xml)" % re.escape(rid), res)
    return rd("xml_" + mm.group(1).replace("/", "_") + ".txt") if mm else None
nsc = res_file("networkSecurityConfig")
if nsc is None: fail("no pude leer network_security_config del APK")
else:
    if re.search(r"cleartextTrafficPermitted\(0x[0-9a-f]+\)=(true|0xffffffff)", nsc): fail("network_security_config permite trafico en claro")
    else: ok("network_security_config sin trafico en claro")
    srcs = re.findall(r'src="?(\w+)', nsc)
    if "user" in srcs or "debug-overrides" in nsc: fail("network_security_config confia en certificados de la persona o tiene debug-overrides")
    elif srcs and set(srcs) == {"system"}: ok("solo autoridades del sistema")
    else: warn("no pude confirmar trust-anchors=system (%s)" % srcs)
    if "pin-set" in nsc: warn("hay pin-set: comprobar respaldo de pines y fecha de caducidad")
der = res_file("dataExtractionRules")
if der is None: fail("no pude leer data_extraction_rules")
elif "include" in der: fail("data_extraction_rules incluye datos")
else: ok("data_extraction_rules sin datos en copia ni transferencia")

# --- dex: carga dinamica de codigo
dexs = [os.path.join(tmp, "apk", f) for f in os.listdir(os.path.join(tmp, "apk")) if f.endswith(".dex")]
blob = b"".join(open(f, "rb").read() for f in dexs)
dynamite = b"Lcom/google/android/gms/dynamite/" in blob
loaders = 0
for needle in (b"Ldalvik/system/DexClassLoader;", b"Ldalvik/system/InMemoryDexClassLoader;", b"Ldalvik/system/PathClassLoader;", b"Ldalvik/system/BaseDexClassLoader;"):
    if needle in blob:
        loaders += 1
        # PathClassLoader lo usa DynamiteModule de Google Play services (modulos firmados por Google); nada mas lo justifica
        if needle == b"Ldalvik/system/PathClassLoader;" and dynamite: warn("el dex referencia PathClassLoader (DynamiteModule de Google Play services; revisar si cambia)")
        else: fail("el dex referencia " + needle.decode() + " (carga dinamica de codigo)")
if dexs and not loaders: ok("dex sin DexClassLoader/InMemoryDexClassLoader/PathClassLoader (%d archivos)" % len(dexs))
if not dexs: fail("no encontre classes*.dex en el APK")
if dynamite:
    warn("incluye DynamiteModule de Google Play services (carga modulos firmados por Google desde Play services; no es codigo de Contigo)")
# (com/google/firebase/analytics/connector/ es solo una interfaz que trae firebase-messaging: no es el SDK de Analytics)
for lib in (b"Lcom/google/firebase/analytics/FirebaseAnalytics;", b"Lcom/google/android/gms/measurement/AppMeasurement", b"Lcom/google/android/gms/ads/", b"Lcom/google/firebase/crashlytics/", b"Lcom/facebook/", b"Lcom/appsflyer/", b"Lcom/adjust/sdk/"):
    if lib in blob: fail("libreria de publicidad/analitica: " + lib.decode())
ok("sin librerias de publicidad ni analitica conocidas")

# --- assets web
assets = os.path.join(tmp, "apk", "assets")
maps = [os.path.join(dp, f) for dp, _, fs in os.walk(assets) for f in fs if f.endswith(".map")]
(fail if maps else ok)("mapas de codigo en assets: %d" % len(maps))
cc = os.path.join(assets, "capacitor.config.json")
if os.path.exists(cc):
    c = json.load(open(cc, encoding="utf-8")); a = c.get("android", {})
    probs = [k for k in ("server",) if k in c] + (["webContentsDebuggingEnabled"] if a.get("webContentsDebuggingEnabled", c.get("webContentsDebuggingEnabled")) else []) + (["allowMixedContent"] if a.get("allowMixedContent", c.get("allowMixedContent")) else [])
    (fail if probs else ok)("capacitor.config.json endurecido" + (": " + ", ".join(probs) if probs else ""))
    if c.get("loggingBehavior") != "none": fail("capacitor loggingBehavior=%s (debe ser none)" % c.get("loggingBehavior"))
else: fail("no hay assets/capacitor.config.json")
idx = os.path.join(assets, "public", "index.html")
if os.path.exists(idx) and "Content-Security-Policy" not in open(idx, encoding="utf-8", errors="replace").read():
    warn("index.html del APK sin CSP (S-06: parche propuesto, no aplicado)")

# --- alineacion 16 KB (Android 15+): informativo
if os.path.exists(os.path.join(tmp, "zipalign.ok")): ok("zipalign -P 16: alineado a 16 KB")
else: warn("zipalign -P 16 no confirma alineacion de 16 KB de las .so (informativo)")

print("RESUMEN falla=%d aviso=%d" % (len(fails), len(warns)))
sys.exit(1 if fails else 0)
PY
