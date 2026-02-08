# Supported File Formats

## Floor Plan Upload

### Supported Formats

| Format | Extensions | MIME Type | Notes |
|--------|-----------|-----------|-------|
| **PNG** | `.png` | `image/png` | Direct analysis |
| **JPEG** | `.jpg`, `.jpeg` | `image/jpeg` | Direct analysis |
| **WebP** | `.webp` | `image/webp` | Direct analysis |
| **PDF** | `.pdf` | `application/pdf` | First page converted to PNG |

### Detection Method

File format is detected by:
1. **File extension** (primary)
2. **Content headers** (magic bytes) as fallback:
   - PNG: `\x89PNG\r\n\x1a\n`
   - JPEG: `\xff\xd8`
   - PDF: `%PDF`

### Size Limits

- **Maximum file size**: 20 MB
- Files exceeding this limit are rejected
- Empty files are rejected

### PDF Processing

PDFs are processed as follows:
1. First page is extracted using PyMuPDF (`fitz`)
2. Rendered to PNG at 150 DPI
3. Converted image is analyzed by vision LLM
4. If PDF conversion fails, analysis is skipped

**Requirements:**
- `PyMuPDF` package must be installed for PDF support
- If not installed, PDF uploads will fail gracefully

### Frontend Restrictions

The frontend file input accepts:
```html
accept="image/*,.pdf"
```

This allows:
- All image types (PNG, JPEG, WebP, etc.)
- PDF files

### Error Handling

**Unsupported Format:**
- Returns `LayoutAnalysis` with `confidence=0.0`
- `layout_type="unknown"`
- `rooms=[]`
- Notes suggest user describe their home in chat

**PDF Conversion Failure:**
- Logs warning
- Returns `None` from `analyze_layout_with_vision`
- Falls back to unanalyzed layout

**File Too Large:**
- Logs debug message
- Returns `None` from `analyze_layout_with_vision`
- Falls back to unanalyzed layout

## Code References

**Format Detection:**
- `backend/app/services/layout/layout_vision.py::_infer_media_type()`

**PDF Processing:**
- `backend/app/services/layout/layout_vision.py::_pdf_to_image_bytes()`

**Size Validation:**
- `backend/app/services/layout/layout_vision.py::analyze_layout_with_vision()` (line 128)

**Frontend:**
- `e-smart-living-advisor/src/components/LayoutUpload.tsx` (line 105)

## Example Usage

```python
# Backend accepts any file format
@router.post("/analyze")
async def analyze_layout(file: UploadFile = File(...)):
    analysis = analyze_layout_bytes(file.filename, content)
    # Returns LayoutAnalysis regardless of format
    # If unsupported, confidence=0.0 with helpful notes
```

```typescript
// Frontend file input
<input
  type="file"
  accept="image/*,.pdf"
  onChange={handleFileChange}
/>
```

## Future Enhancements

Potential additions:
- Multi-page PDF support (currently first page only)
- Additional image formats (TIFF, BMP, etc.)
- CAD file support (DWG, DXF)
- SVG support
