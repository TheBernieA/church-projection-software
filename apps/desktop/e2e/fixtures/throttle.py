"""A slow upload for the latency test: a TCP relay that passes on at most KBPS kilobits a
second towards the server, with small socket buffers (like a real access link), so a sender
that sends too much backs up on its own side instead of in the relay.

usage: python3 -I throttle.py LISTEN_PORT TARGET_PORT KBPS
"""
import socket
import sys
import threading
import time

listen_port, target_port, kbps = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
rate = kbps * 1000 / 8  # bytes a second
BUF = 32 * 1024


def pipe_up(src: socket.socket, dst: socket.socket) -> None:
    """Client → server, at the link's rate."""
    allowance, last = 0.0, time.monotonic()
    try:
        while True:
            now = time.monotonic()
            allowance = min(rate * 0.05, allowance + (now - last) * rate)
            last = now
            if allowance < 1024:
                time.sleep(0.005)
                continue
            data = src.recv(int(min(allowance, 16 * 1024)))
            if not data:
                break
            dst.sendall(data)
            allowance -= len(data)
    except OSError:
        pass
    finally:
        for s in (src, dst):
            try:
                s.close()
            except OSError:
                pass


def pipe_down(src: socket.socket, dst: socket.socket) -> None:
    """Server → client, as fast as it comes (acks, RTMP replies)."""
    try:
        while True:
            data = src.recv(16 * 1024)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass


server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
# Small receive buffer on the relay's side: set before accept so the window starts small.
server.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, BUF)
server.bind(("127.0.0.1", listen_port))
server.listen(4)
print("ready", flush=True)
while True:
    client, _ = server.accept()
    client.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, BUF)
    upstream = socket.create_connection(("127.0.0.1", target_port))
    threading.Thread(target=pipe_up, args=(client, upstream), daemon=True).start()
    threading.Thread(target=pipe_down, args=(upstream, client), daemon=True).start()
