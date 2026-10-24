// OCR a scanned PDF with Apple's Vision framework (offline, French).
// Usage: ocr-pdf <file.pdf> <outdir> [first-last] [scale]
// Writes <outdir>/pNNN.json with recognised lines and their boxes
// (origin bottom-left, normalised 0..1), plus <outdir>/pNNN.png when PNG=1 is set.
import Foundation
import PDFKit
import Vision
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else { fputs("usage: ocr-pdf file.pdf outdir [first-last] [scale]\n", stderr); exit(2) }
let url = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
guard let doc = PDFDocument(url: url) else { fputs("cannot open \(args[1])\n", stderr); exit(1) }
var first = 1, last = doc.pageCount
if args.count >= 4 {
  let parts = args[3].split(separator: "-").map { Int($0) ?? 0 }
  if parts.count == 2 { first = max(1, parts[0]); last = min(doc.pageCount, parts[1]) }
  else if parts.count == 1 { first = parts[0]; last = parts[0] }
}
let scale = CGFloat(args.count >= 5 ? Double(args[4]) ?? 2.0 : 2.0)
let savePng = ProcessInfo.processInfo.environment["PNG"] == "1"
// CROP=x0,y0,x1,y1 (fractions of the page, origin top-left) renders only that part: a two-page spread's left page, say, at a higher scale
let crop: [CGFloat] = (ProcessInfo.processInfo.environment["CROP"] ?? "0,0,1,1").split(separator: ",").map { CGFloat(Double($0) ?? 0) }

func render(_ page: PDFPage) -> CGImage? {
  let full = page.bounds(for: .mediaBox)
  let box = crop.count == 4 ? CGRect(x: full.minX + crop[0] * full.width, y: full.minY + (1 - crop[3]) * full.height, width: (crop[2] - crop[0]) * full.width, height: (crop[3] - crop[1]) * full.height) : full
  let w = Int(box.width * scale), h = Int(box.height * scale)
  let cs = CGColorSpaceCreateDeviceGray()
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
  ctx.setFillColor(gray: 1, alpha: 1)
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.saveGState()
  ctx.scaleBy(x: scale, y: scale)
  ctx.translateBy(x: -box.minX, y: -box.minY)
  ctx.clip(to: box)
  page.draw(with: .mediaBox, to: ctx)
  ctx.restoreGState()
  return ctx.makeImage()
}

func writePng(_ img: CGImage, _ path: URL) {
  guard let dest = CGImageDestinationCreateWithURL(path as CFURL, UTType.png.identifier as CFString, 1, nil) else { return }
  CGImageDestinationAddImage(dest, img, nil)
  CGImageDestinationFinalize(dest)
}

struct Line: Codable { let text: String; let x: Double; let y: Double; let w: Double; let h: Double; let conf: Double; let xl: Double; let yl: Double } // xl, yl: the bottom-left corner of the text itself, which keeps reading order right on a slightly rotated scan

for i in first...last {
  guard let page = doc.page(at: i - 1), let img = render(page) else { continue }
  let name = String(format: "p%03d", i)
  if savePng { writePng(img, out.appendingPathComponent(name + ".png")) }
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.recognitionLanguages = ["fr-FR"]
  req.usesLanguageCorrection = true
  let handler = VNImageRequestHandler(cgImage: img, options: [:])
  do { try handler.perform([req]) } catch { fputs("page \(i): \(error)\n", stderr); continue }
  var lines: [Line] = []
  for obs in req.results ?? [] {
    guard let c = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox
    lines.append(Line(text: c.string, x: b.minX, y: b.minY, w: b.width, h: b.height, conf: Double(c.confidence), xl: obs.bottomLeft.x, yl: obs.bottomLeft.y))
  }
  // top-to-bottom, then left-to-right
  lines.sort { a, b in abs(a.y - b.y) > 0.004 ? a.y > b.y : a.x < b.x }
  let enc = JSONEncoder(); enc.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
  let data = try! enc.encode(["page": AnyCodable(i), "width": AnyCodable(img.width), "height": AnyCodable(img.height), "lines": AnyCodable(lines)])
  try? data.write(to: out.appendingPathComponent(name + ".json"))
  print("\(name) \(lines.count) lines")
}

// minimal type-erased encoder
struct AnyCodable: Encodable {
  let v: Any
  init(_ v: Any) { self.v = v }
  func encode(to e: Encoder) throws {
    var c = e.singleValueContainer()
    switch v {
    case let x as Int: try c.encode(x)
    case let x as String: try c.encode(x)
    case let x as [Line]: try c.encode(x)
    default: try c.encodeNil()
    }
  }
}
