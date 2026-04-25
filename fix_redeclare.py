import re

with open('api_test_e2e.ts', 'r') as f:
    content = f.read()

# Replace:
# const _r = await apiRequest( ... );
# await _r.text();
# with:
# await (await apiRequest( ... )).text();

content = re.sub(r'const _r = await apiRequest\((.*?)\);\n(\s*)await _r\.text\(\);', r'await (await apiRequest(\1)).text();', content, flags=re.DOTALL)

with open('api_test_e2e.ts', 'w') as f:
    f.write(content)
