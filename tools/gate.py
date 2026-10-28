#!/usr/bin/env python3
"""The password on the public site. GitHub Pages is a static host: there is no server to check a password, and anything a page could check
in the browser a visitor could also skip. So the public build publishes no readable copy of the app at all. build.py seals the page, the
scripts and the course into one encrypted file (allons-y.enc); docs/index.html is a small lock page (gate.html) that asks for the password,
derives the key in the browser and decrypts. The same key seals the progress backup (backup.enc). Without the password both files are noise.

  gate.json   project root, never committed (.gitignore). Written by  python3 build.py --set-password.
              {"salt": hex, "iters": N, "keys": hex, "set": "YYYY-MM-DD"} — the derived key, not the password: the password is nowhere on disk.
              Lost it? Set a new password and publish; every device then asks for the new one. Nothing else depends on it.

Scheme: PBKDF2-HMAC-SHA256(password, salt, iters) → 64 bytes = AES-256-CTR key ‖ HMAC-SHA256 key. The data is deflated, encrypted, and the
tag covers header and ciphertext (encrypt-then-MAC). File layout: b"ALY1" ‖ salt(16) ‖ iv(16) ‖ tag(32) ‖ ciphertext. AES comes from macOS's
own /usr/bin/openssl (verified against the NIST CTR vector), so there is nothing to install; the browser side is Web Crypto, in gate.html."""
import os, io, sys, json, hmac, zlib, time, hashlib, getpass, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAGIC = b'ALY1'; ITERS = 300000
DEFAULT = os.path.join(ROOT, 'gate.json')

def derive(password, salt, iters=ITERS): return hashlib.pbkdf2_hmac('sha256', password.encode('utf8'), salt, iters, 64)

def aes_ctr(key, iv, data):
    r = subprocess.run(['openssl', 'enc', '-aes-256-ctr', '-K', key.hex(), '-iv', iv.hex()], input=data, capture_output=True)
    if r.returncode: sys.exit('openssl failed: ' + r.stderr.decode(errors='replace'))
    return r.stdout

def seal(gate, data):
    """bytes → the sealed file as bytes."""
    keys = bytes.fromhex(gate['keys']); head = MAGIC + bytes.fromhex(gate['salt']) + os.urandom(16)
    ct = aes_ctr(keys[:32], head[20:36], zlib.compress(data, 9))
    return head + hmac.new(keys[32:], head + ct, hashlib.sha256).digest() + ct

def unseal(gate, blob):
    """the inverse, for checking a build; raises on a wrong key or a damaged file."""
    keys = bytes.fromhex(gate['keys'])
    if blob[:4] != MAGIC or len(blob) < 68: raise ValueError('not a sealed file')
    head, tag, ct = blob[:36], blob[36:68], blob[68:]
    if not hmac.compare_digest(tag, hmac.new(keys[32:], head + ct, hashlib.sha256).digest()): raise ValueError('the key does not fit')
    return zlib.decompress(aes_ctr(keys[:32], head[20:36], ct))

def load(path=DEFAULT):
    """the gate file as a dict, or None when there is none."""
    if not os.path.exists(path): return None
    g = json.load(io.open(path, encoding='utf8'))
    if not (isinstance(g, dict) and len(g.get('salt', '')) == 32 and len(g.get('keys', '')) == 128): sys.exit('%s is not a gate file; run  python3 build.py --set-password' % path)
    return g

def set_password(path=DEFAULT, password=None):
    """asks for a new password (or takes GATE_PASSWORD from the environment, for scripts), derives the key and writes the gate file."""
    if password is None:
        try: password = getpass.getpass('New password for the public site: '); again = getpass.getpass('Once more: ')
        except (EOFError, KeyboardInterrupt): sys.exit('\nno password set')
        if password != again: sys.exit('the two did not match; nothing changed')
    if len(password) < 8: sys.exit('use at least 8 characters; nothing changed')
    salt = os.urandom(16)
    g = {'salt': salt.hex(), 'iters': ITERS, 'keys': derive(password, salt).hex(), 'set': time.strftime('%Y-%m-%d')}
    io.open(path, 'w', encoding='utf8').write(json.dumps(g, indent=1) + '\n'); os.chmod(path, 0o600)
    return g

if __name__ == '__main__':  # python3 tools/gate.py seal|unseal in out   with gate.json
    g = load() or sys.exit('no gate.json')
    cmd, src, dst = sys.argv[1:4]
    data = io.open(src, 'rb').read()
    io.open(dst, 'wb').write(seal(g, data) if cmd == 'seal' else unseal(g, data)); print('wrote', dst)
