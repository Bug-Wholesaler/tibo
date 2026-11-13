import os
from collections import deque
from PIL import Image


def process_sprite(input_path, output_path, white_thresh=235, feather_thresh=205):
    if not os.path.exists(input_path):
        print(f"Skipping missing input: {input_path}")
        return False

    img = Image.open(input_path).convert("RGBA")
    width, height = img.size
    pixels = img.load()

    visited = [[False] * height for _ in range(width)]
    is_bg = [[False] * height for _ in range(width)]

    def is_outer_white(x, y):
        r, g, b, _ = pixels[x, y]
        # 允许 JPG 边缘轻微压缩噪点，只要三通道高亮且接近中性白即视为外围背景
        spread = max(r, g, b) - min(r, g, b)
        return r >= white_thresh and g >= white_thresh and b >= white_thresh and spread <= 22

    queue = deque()
    # 四条画布边界作为漫水填充初始种子
    for x in range(width):
        if is_outer_white(x, 0):
            queue.append((x, 0))
            visited[x][0] = True
        if is_outer_white(x, height - 1):
            queue.append((x, height - 1))
            visited[x][height - 1] = True

    for y in range(height):
        if is_outer_white(0, y) and not visited[0][y]:
            queue.append((0, y))
            visited[0][y] = True
        if is_outer_white(width - 1, y) and not visited[width - 1][y]:
            queue.append((width - 1, y))
            visited[width - 1][y] = True

    # 4-邻域 BFS 边缘漫水填充，绝不穿透闭合深色线稿，保护银发、镜片反光与纸张
    while queue:
        cx, cy = queue.popleft()
        is_bg[cx][cy] = True

        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < width and 0 <= ny < height and not visited[nx][ny]:
                visited[nx][ny] = True
                if is_outer_white(nx, ny):
                    queue.append((nx, ny))

    # 应用透明通道并对紧邻背景的 1~2px 边缘像素做抗锯齿平滑羽化
    neighbors_1px = ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1))
    neighbors_2px = ((-2, 0), (2, 0), (0, -2), (0, 2))

    for x in range(width):
        for y in range(height):
            if is_bg[x][y]:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                r, g, b, a = pixels[x, y]
                dist_ring = 0
                for dx, dy in neighbors_1px:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < width and 0 <= ny < height and is_bg[nx][ny]:
                        dist_ring = 1
                        break
                if dist_ring == 0:
                    for dx, dy in neighbors_2px:
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < width and 0 <= ny < height and is_bg[nx][ny]:
                            dist_ring = 2
                            break

                if dist_ring > 0:
                    brightness = (r + g + b) / 3.0
                    local_thresh = feather_thresh if dist_ring == 1 else (feather_thresh + 20)
                    if brightness >= local_thresh:
                        ratio = (brightness - local_thresh) / max(1.0, (255.0 - local_thresh))
                        alpha = int(max(0, min(255, (1.0 - ratio) * 255)))
                        pixels[x, y] = (r, g, b, alpha)

    img.save(output_path, "PNG", optimize=True)
    print(f"Generated transparent sprite: {output_path} ({width}x{height})")
    return True


if __name__ == "__main__":
    day4_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    assets_dir = os.path.join(day4_dir, "assets")
    sprite_names = [
        "jensen_broken",
        "jensen_normal",
        "jensen_blush",
        "jensen_shock",
        "jensen_sad",
        "jensen_cool",
    ]
    for name in sprite_names:
        src = os.path.join(assets_dir, f"{name}.jpg")
        dst = os.path.join(assets_dir, f"{name}.png")
        process_sprite(src, dst)
    print("All available sprites processed!")
