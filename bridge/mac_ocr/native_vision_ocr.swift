// Native, local-only OCR of cropped deck labels using Apple's Vision framework.
// Usage: autovj_vision_ocr crop1.png crop2.png ...
// Output: [{"text":"...","confidence":0.99}, ...] matching input order.
import Foundation
import Vision

let arguments = Array(CommandLine.arguments.dropFirst())
let fastMode = arguments.first == "--fast"
let paths = fastMode ? Array(arguments.dropFirst()) : arguments
var output: [[String: Any]] = []
for path in paths {
    do {
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = fastMode ? .fast : .accurate
        request.recognitionLanguages = fastMode ? ["en-US"] : ["ja-JP", "en-US"]
        request.usesLanguageCorrection = false
        let handler = VNImageRequestHandler(data: data, options: [:])
        try handler.perform([request])
        let observations = request.results ?? []
        var chunks: [(Float, String, Float)] = []
        for observation in observations {
            if let top = observation.topCandidates(1).first {
                chunks.append((Float(observation.boundingBox.midY), top.string, top.confidence))
            }
        }
        // Top-to-bottom order, only keep line(s) inside the provided ROI.
        chunks.sort { $0.0 > $1.0 }
        let string = chunks.map { $0.1 }.joined(separator: " ")
        let confidence = chunks.isEmpty ? 0.0 : Double(chunks.map{$0.2}.reduce(0,+))/Double(chunks.count)
        output.append(["text":string, "confidence":confidence])
    } catch {
        output.append(["text":"", "confidence":0.0, "error":String(describing:error)])
    }
}
if let data = try? JSONSerialization.data(withJSONObject:output, options:[.fragmentsAllowed]),
   let s = String(data:data,encoding:.utf8) {
    print(s)
} else {
    fputs("JSON serialization failed\n", stderr)
    exit(1)
}
