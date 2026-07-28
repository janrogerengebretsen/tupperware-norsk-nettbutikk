from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlencode, urlparse
from urllib.request import Request, urlopen
from html.parser import HTMLParser
from pathlib import Path
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import unicodedata


APP_HOST = os.environ.get("HOST", "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
APP_PORT = int(os.environ.get("PORT", "8789"))
BASE_URL = "https://tupperware-eu.com"
SHOP_PATH = "/no"
CONSULTANT_REF = "LISBETHOVERBYE"
ROOT = Path(__file__).resolve().parent
NODE_EXE = shutil.which("node") or os.path.expanduser(
    r"~\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
CACHE_TTL = 15 * 60
CACHE = {}
CACHE_LOCK = threading.Lock()


NAVIGATION = [
    {
        "title": "Spesialtilbud",
        "handle": "special-sales",
        "children": [
            ("Tupperware-salg", "soldes-tupperware"),
            ("Ukens tilbud", "weekly-offer"),
        ],
    },
    {
        "title": "Oppbevaring",
        "handle": "conservation",
        "children": [
            ("Sek - Skap", "dry-storage"),
            ("Kjøleskap", "refregirator-storage"),
            ("Fryser", "freezer_storage"),
            ("Tupperware i glass", "tupperware-verre"),
        ],
    },
    {
        "title": "Forberedelse",
        "handle": "preparation",
        "children": [
            ("Bakverk", "baking"),
            ("Kjøkkenredskaper", "kitchen-utensils"),
            ("Boller", "bowls"),
            ("Kniver", "knives"),
            ("Robot", "kitchen-tools"),
            ("Silikonformer", "moule-silicone"),
        ],
    },
    {
        "title": "Steking og oppvarming",
        "handle": "cooking-and-reheatable",
        "children": [
            ("Mikrobølgeovn", "microwave"),
            ("Ovn", "oven"),
            ("Luftfrityrkoker", "air-fryer"),
            ("Panner, kasseroller og gryter", "poeles-casseroles-et-fetou"),
        ],
    },
    {
        "title": "Servering",
        "handle": "serving-and-entertaining",
        "children": [
            ("Skåler og fat", "plates-and-bowls"),
            ("Bestikk", "cultery"),
            ("Drikkevarer", "beverage"),
            ("Kopper", "mugs"),
        ],
    },
    {
        "title": "Ta med",
        "handle": "on-the-go",
        "children": [
            ("Lunsj og snacks", "lunch-and-snacks"),
            ("Termoflasker", "thermal-drinkware"),
            ("Flasker", "bottles"),
        ],
    },
    {
        "title": "Andre",
        "handle": "other",
        "children": [
            ("Hjem og vedlikehold", "home-and-care"),
            ("Barn og baby", "kids-and-toys"),
            ("Recycline-serien", "eco"),
            ("Multifunksjonell", "multi-usage"),
            ("Reservedeler", "pieces-detachees"),
        ],
    },
]


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        text = clean_text(data)
        if text:
            self.parts.append(text)


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def html_to_text(value):
    parser = TextParser()
    parser.feed(value or "")
    return clean_text(" ".join(parser.parts))


def search_key(value):
    value = unicodedata.normalize("NFKD", clean_text(value).lower())
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def fetch_url(url, timeout=35):
    if sys.platform.startswith("win") and url.startswith("https://"):
        return fetch_url_node(url, timeout)
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "no,en;q=0.8",
            "Accept": "application/json,text/html;q=0.8",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def fetch_url_node(url, timeout):
    script = r"""
const url = process.argv[1];
fetch(url, {
  headers: {
    "user-agent": "Mozilla/5.0",
    "accept-language": "no,en;q=0.8",
    "accept": "application/json,text/html;q=0.8"
  }
}).then(async response => {
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    console.error(`${response.status} ${response.statusText}`);
    process.exit(2);
  }
  process.stdout.write(buffer.toString("base64"));
}).catch(error => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
"""
    env = os.environ.copy()
    env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"
    result = subprocess.run(
        [NODE_EXE, "--no-warnings", "-e", script, url],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        timeout=timeout + 8,
    )
    if result.returncode != 0 or not result.stdout:
        raise RuntimeError(clean_text(result.stderr) or "Kunne ikke hente butikkdata.")
    return base64.b64decode(result.stdout).decode("utf-8", errors="replace")


def cached(key, loader):
    now = time.time()
    with CACHE_LOCK:
        item = CACHE.get(key)
        if item and now - item["time"] < CACHE_TTL:
            return item["value"]
    value = loader()
    with CACHE_LOCK:
        CACHE[key] = {"time": now, "value": value}
    return value


def fetch_paginated_products(collection=""):
    products = []
    if collection:
        path = f"{SHOP_PATH}/collections/{quote(collection)}/products.json"
    else:
        path = f"{SHOP_PATH}/products.json"
    for page in range(1, 6):
        query = urlencode({"limit": 250, "page": page, "country": "NO"})
        payload = json.loads(fetch_url(f"{BASE_URL}{path}?{query}"))
        page_products = payload.get("products") or []
        products.extend(page_products)
        if len(page_products) < 250:
            break
    return products


def normalize_image(image):
    if isinstance(image, dict):
        return clean_text(image.get("src"))
    return clean_text(image)


def normalize_product(product):
    variants = product.get("variants") or []
    preferred = next((variant for variant in variants if variant.get("available")), None)
    variant = preferred or (variants[0] if variants else {})
    images = [normalize_image(image) for image in (product.get("images") or [])]
    images = [image for image in images if image]
    title = clean_text(product.get("title"))
    handle = clean_text(product.get("handle"))
    sku = clean_text(variant.get("sku"))
    price = float(variant.get("price") or 0)
    compare_at = float(variant.get("compare_at_price") or 0)
    if compare_at <= price:
        compare_at = 0
    description = html_to_text(product.get("body_html") or product.get("description"))
    tags = [clean_text(tag) for tag in (product.get("tags") or []) if clean_text(tag)]
    searchable = search_key(" ".join([title, sku, description, " ".join(tags)]))
    return {
        "id": product.get("id"),
        "title": title,
        "handle": handle,
        "articleNumber": sku or (handle if handle.isdigit() else ""),
        "description": description,
        "price": price,
        "compareAtPrice": compare_at,
        "available": any(item.get("available") for item in variants),
        "image": images[0] if images else "",
        "images": images[:10],
        "tags": tags,
        "searchable": searchable,
        "url": f"{BASE_URL}{SHOP_PATH}/products/{quote(handle)}?ref={CONSULTANT_REF}",
    }


def get_products(collection=""):
    key = f"products:{collection or 'all'}"
    raw = cached(key, lambda: fetch_paginated_products(collection))
    return [normalize_product(product) for product in raw]


def get_collections():
    def load():
        url = f"{BASE_URL}{SHOP_PATH}/collections.json?limit=250"
        return json.loads(fetch_url(url)).get("collections") or []

    raw = cached("collections", load)
    by_handle = {item.get("handle"): item for item in raw}
    result = []
    all_item = by_handle.get("tupperware") or {}
    result.append(
        {
            "title": "Alle produkter",
            "handle": "",
            "image": normalize_image(all_item.get("image")),
            "children": [],
        }
    )
    for group in NAVIGATION:
        source = by_handle.get(group["handle"]) or {}
        children = []
        for title, handle in group["children"]:
            child = by_handle.get(handle) or {}
            children.append(
                {
                    "title": clean_text(child.get("title")) or title,
                    "handle": handle,
                    "image": normalize_image(child.get("image")),
                }
            )
        result.append(
            {
                "title": group["title"],
                "handle": group["handle"],
                "image": normalize_image(source.get("image")),
                "children": children,
            }
        )
    return result


def product_detail(handle):
    products = get_products()
    match = next((product for product in products if product["handle"] == handle), None)
    if match:
        return match
    url = f"{BASE_URL}{SHOP_PATH}/products/{quote(handle)}.json?country=NO"
    payload = json.loads(fetch_url(url))
    return normalize_product(payload.get("product") or {})


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[butikk] {self.address_string()} - {format % args}")

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/api/health":
            return self.json_response(200, {"ok": True})
        if path == "/api/navigation":
            try:
                return self.json_response(
                    200,
                    {
                        "collections": get_collections(),
                        "consultant": CONSULTANT_REF,
                        "source": f"{BASE_URL}{SHOP_PATH}",
                    },
                )
            except Exception as error:
                return self.json_response(502, {"error": str(error)})
        if path == "/api/products":
            try:
                collection = clean_text((query.get("collection") or [""])[0])
                search = search_key((query.get("q") or [""])[0])
                sort = clean_text((query.get("sort") or ["featured"])[0])
                products = get_products(collection)
                if search:
                    words = [word for word in search.split() if word]
                    products = [
                        product
                        for product in products
                        if all(word in product["searchable"] for word in words)
                    ]
                if sort == "title":
                    products.sort(key=lambda item: search_key(item["title"]))
                elif sort == "price-asc":
                    products.sort(key=lambda item: item["price"])
                elif sort == "price-desc":
                    products.sort(key=lambda item: item["price"], reverse=True)
                elif sort == "sale":
                    products.sort(
                        key=lambda item: (
                            item["compareAtPrice"] <= 0,
                            -(
                                (item["compareAtPrice"] - item["price"])
                                / item["compareAtPrice"]
                                if item["compareAtPrice"]
                                else 0
                            ),
                        )
                    )
                return self.json_response(
                    200,
                    {
                        "products": products,
                        "count": len(products),
                        "collection": collection,
                    },
                )
            except Exception as error:
                return self.json_response(502, {"error": str(error)})
        if path.startswith("/api/products/"):
            try:
                handle = path.rsplit("/", 1)[-1]
                return self.json_response(200, {"product": product_detail(handle)})
            except Exception as error:
                return self.json_response(502, {"error": str(error)})

        return self.serve_static(path)

    def serve_static(self, path):
        filenames = {
            "/": ("index.html", "text/html; charset=utf-8"),
            "/index.html": ("index.html", "text/html; charset=utf-8"),
            "/styles.css": ("styles.css", "text/css; charset=utf-8"),
            "/app.js": ("app.js", "application/javascript; charset=utf-8"),
        }
        item = filenames.get(path)
        if not item:
            return self.json_response(404, {"error": "Fant ikke siden."})
        filename, content_type = item
        body = (ROOT / filename).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def json_response(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer((APP_HOST, APP_PORT), Handler)
    print(f"Tupperware Norsk Nettbutikk kjører på http://127.0.0.1:{APP_PORT}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
