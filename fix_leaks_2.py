import re

with open('api_test_e2e.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    if "Deno.test(\"User Registration\"," in line:
        new_lines.append(line)
        while i < len(lines):
            i += 1
            l = lines[i]
            if "assertEquals(resp.status, 201);" in l:
                new_lines.append(l)
                new_lines.append(l.replace("assertEquals(resp.status, 201);", "await resp.text();"))
            else:
                new_lines.append(l)
            if "});" in l:
                break
    else:
        new_lines.append(line)
    i += 1

with open('api_test_e2e.ts', 'w') as f:
    f.writelines(new_lines)
