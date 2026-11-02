import zipfile
import os
from pathlib import Path
import xml.etree.ElementTree as ET

docx_path = r'c:\Users\Kaafl\OneDrive\Desktop\Leonida Vice\Ultimate RAG AI Team Architecture.docx'
extract_dir = Path(r'C:\Users\Kaafl\.gemini\antigravity\brain\03c414a3-d75b-4c18-9a90-e145f244ccbb\extracted_docx_images')
extract_dir.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(docx_path) as z:
    # Read rels
    rels_xml = z.read('word/_rels/document.xml.rels')
    root_rels = ET.fromstring(rels_xml)
    rel_map = {}
    for r in root_rels:
        r_id = r.attrib.get('Id')
        target = r.attrib.get('Target')
        if target:
            rel_map[r_id] = target
            
    # Extract media
    for f in z.namelist():
        if f.startswith('word/media/'):
            filename = os.path.basename(f)
            target_path = extract_dir / filename
            target_path.write_bytes(z.read(f))

    # Find where images are referenced in document.xml
    doc_xml = z.read('word/document.xml')
    root_doc = ET.fromstring(doc_xml)
    namespaces = {
        'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    }

    print('=== IMAGE REFERENCES IN DOCUMENT PARAGRAPHS ===')
    for p_idx, p in enumerate(root_doc.iterfind('.//w:p', namespaces)):
        text = ''.join([t.text for t in p.iterfind('.//w:t', namespaces) if t.text])
        blips = p.findall('.//a:blip', namespaces)
        for b in blips:
            embed_id = b.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
            target_file = rel_map.get(embed_id, 'unknown')
            print(f'P{p_idx}: "{text[:70]}" -> {embed_id} -> {target_file}')
