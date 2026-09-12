import html
import re
from html.parser import HTMLParser


class HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.result = []
        self.hide_output = False

    def handle_starttag(self, tag, attrs):
        tag_lower = tag.lower()
        if tag_lower in ("script", "style", "head", "title", "meta", "noscript"):
            self.hide_output = True
        elif tag_lower in (
            "p",
            "div",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "tr",
            "table",
            "section",
            "article",
            "blockquote",
            "pre",
        ):
            self.result.append("\n")
        elif tag_lower in ("br", "hr"):
            self.result.append("\n")
        elif tag_lower == "li":
            self.result.append("\n• ")

    def handle_endtag(self, tag):
        tag_lower = tag.lower()
        if tag_lower in ("script", "style", "head", "title", "meta", "noscript"):
            self.hide_output = False
        elif tag_lower in (
            "p",
            "div",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "tr",
            "table",
            "section",
            "article",
            "blockquote",
            "pre",
        ):
            self.result.append("\n")

    def handle_data(self, data):
        if not self.hide_output:
            self.result.append(data)

    def get_text(self) -> str:
        raw = "".join(self.result)
        raw = raw.replace("\xa0", " ")
        lines = [re.sub(r"[ \t]+", " ", line).strip() for line in raw.split("\n")]
        text = "\n".join(lines)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


def strip_html_tags(html_str: str | None) -> str:
    """
    Extracts clean, readable plain text from an HTML snippet or document,
    unescaping entities and preserving logical line breaks.
    """
    if not html_str:
        return ""
    if not isinstance(html_str, str):
        html_str = str(html_str)
    try:
        parser = HTMLTextExtractor()
        parser.feed(html_str)
        return parser.get_text()
    except Exception:
        text = re.sub(r"<[^>]+>", " ", html_str)
        text = html.unescape(text)
        text = text.replace("\xa0", " ")
        text = re.sub(r"\s+", " ", text).strip()
        return text
