import re

with open('api_test_e2e.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    # Check if line starts with await apiRequest (no assignment)
    match = re.match(r'^(\s*)await apiRequest\(', line)
    if match:
        indent = match.group(1)
        new_lines.append(line.replace('await apiRequest', 'const _r = await apiRequest'))
        # advance until the end of the apiRequest call (look for '});')
        while i < len(lines) and '});' not in lines[i]:
            i += 1
            new_lines.append(lines[i])
        new_lines.append(indent + 'await _r.text();\n')
    else:
        new_lines.append(line)
    i += 1

with open('api_test_e2e.ts', 'w') as f:
    f.writelines(new_lines)
