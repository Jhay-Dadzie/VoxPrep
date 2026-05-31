import { PDFParse } from 'pdf-parse';
import { extractRawText } from 'mammoth';

/**
 * Parse uploaded document and extract text
 */
export const parseDocument = async (buffer, originalname) => {
  const ext = originalname.split('.').pop().toLowerCase();
  let parser;
  
  try {
    if (ext === 'pdf') {
      parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      return data.text;
    } 
    else if (ext === 'docx') {
      const result = await extractRawText({ buffer });
      return result.value;
    } 
    else if (ext === 'txt' || ext === 'text') {
      return buffer.toString('utf8');
    } 
    else {
      throw new Error('Unsupported file type. Supported: PDF, DOCX, TXT');
    }
  } catch (error) {
    console.error('Document parsing error:', error);
    throw new Error(`Failed to parse document: ${error.message}`);
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }
};

export default {
  parseDocument,
};
