import re

with open("index.css", "r") as f:
    content = f.read()

notice_re = r'(\.schedule-notice,\s*\.schedule-error\s*\{)([^}]*)'
def replace_notice(m):
    props = m.group(2)
    props = re.sub(r'width:[^;]+;', 'width: 100%;', props)
    props = re.sub(r'margin:[^;]+;', 'margin: 0;', props)
    props = re.sub(r'border-radius:[^;]+;', 'border-radius: 0;', props)
    props = re.sub(r'border:[^;]+;', 'border-bottom: var(--rule-schedule) solid var(--color-schedule-rule);', props)
    return m.group(1) + props

content = re.sub(notice_re, replace_notice, content)

with open("index.css", "w") as f:
    f.write(content)
