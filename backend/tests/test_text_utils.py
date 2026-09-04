import pytest
from text_utils import strip_html_tags


def test_strip_html_basic_tags():
    html_input = "<p><span>Attached here are the Assignment 1 files.</span></p>"
    assert strip_html_tags(html_input) == "Attached here are the Assignment 1 files."


def test_strip_html_links_and_formatting():
    html_input = (
        '<p>Submit your completed activity &amp; budget proposal as<span>&nbsp;</span>'
        '<strong>a PDF file</strong><span>&nbsp;here. N</span>ame file as&nbsp;'
        '<strong>Student ID_MMMYY_Proposal<span>&nbsp;</span></strong>'
        '<span>e.g. A0123456B_Sep23_Proposal.</span></p>'
    )
    expected = (
        "Submit your completed activity & budget proposal as a PDF file here. "
        "Name file as Student ID_MMMYY_Proposal e.g. A0123456B_Sep23_Proposal."
    )
    assert strip_html_tags(html_input) == expected


def test_strip_html_preserves_multiline_paragraphs():
    html_input = "<p>Paragraph 1</p><p>Paragraph 2</p>"
    result = strip_html_tags(html_input)
    assert result == "Paragraph 1\n\nParagraph 2"


def test_strip_html_handles_lists():
    html_input = "<ul><li>Task A</li><li>Task B</li></ul>"
    result = strip_html_tags(html_input)
    assert "• Task A" in result
    assert "• Task B" in result


def test_strip_html_strips_scripts_and_styles():
    html_input = "<style>.hidden{display:none;}</style><p>Hello</p><script>alert(1)</script>"
    assert strip_html_tags(html_input) == "Hello"


def test_strip_html_none_and_empty():
    assert strip_html_tags(None) == ""
    assert strip_html_tags("") == ""
    assert strip_html_tags("   ") == ""


def test_strip_html_plain_text():
    plain = "Just a simple plain text task note."
    assert strip_html_tags(plain) == plain
