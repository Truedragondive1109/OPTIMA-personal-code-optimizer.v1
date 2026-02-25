# OPTIMA — On-Device Code Intelligence Engine

OPTIMA is a sophisticated on-device code optimizer built with React + TypeScript + RunAnywhere SDK (Qwen2.5-0.5B GGUF via LlamaCPP). All inference runs locally in your browser with no data leaving your device.

## 🚀 Features

- **Smart Code Analysis**: Detects algorithms, patterns, and inefficiencies
- **AI-Powered Optimization**: Uses Qwen2.5 0.5B model for intelligent code improvements
- **Multi-Language Support**: JavaScript, TypeScript, Python, Java, C++
- **Real-time Streaming**: Watch the AI optimize your code live
- **Comprehensive Analysis**: Overview panel with complexity analysis and insights
- **Diff Visualization**: See exactly what changed between original and optimized code
- **Detailed Explanations**: Understand why changes were made
- **100% Private**: No code or data ever leaves your device

## 🏗️ Architecture

OPTIMA uses a client-only edge AI architecture with dedicated worker threads:

### Runtime Split
- **Main Thread**: React rendering, UI interactions, status display
- **Worker Thread**: Heavy optimization logic, LLM inference, static analysis

### Core Components
- **`CodeOptimizerTab.tsx`**: Main UI with input/output panels, loading stages
- **`optimizer_worker.ts`**: End-to-end optimization pipeline with smart retry logic
- **`OverviewPanel.tsx`**: Comprehensive analysis display with complexity metrics
- **`ExplainPanel.tsx`**: Detailed optimization explanations
- **`DiffViewer.tsx`**: Side-by-side code comparison

### Intelligence Pipeline
1. **Static Analysis**: Pattern detection, complexity analysis, bottleneck identification
2. **Smart Prompting**: Adaptive prompts based on code size and complexity
3. **LLM Inference**: Qwen2.5 model with optimized parameters
4. **Output Normalization**: Robust parsing with fallback mechanisms

## 🎯 Optimization Capabilities

### Smart Features
- **Algorithm Detection**: Identifies sorting, searching, and other common patterns
- **Complexity Analysis**: Big O notation before/after optimization
- **Bottleneck Detection**: Finds performance bottlenecks automatically
- **Language-Specific Optimizations**: Tailored improvements for each supported language
- **Chunked Processing**: Handles large codebases by intelligent chunking

### Quality Assurance
- **Fallback Mechanisms**: Safe fallback to original code if parsing fails
- **Validation**: Ensures optimized code maintains original functionality
- **Retry Logic**: Smart retries with progressive simplification
- **Timeout Protection**: Prevents infinite loops with configurable timeouts

## 🛠️ Technical Specifications

### Model Configuration
- **Model**: Qwen2.5-0.5B-Instruct-Q4_0 (500M parameters)
- **Framework**: LlamaCPP WebAssembly
- **Memory**: 350MB requirement
- **Temperature**: 0.05 (consistent, focused output)
- **Timeout**: 90 seconds (CPU inference)
- **Token Limits**: Adaptive (300-1200 based on code size)

### Performance Optimizations
- **Adaptive Token Limits**: Scales with code complexity
- **Progressive Chunking**: Intelligent code splitting for large inputs
- **Streaming Interface**: Real-time output during processing
- **Memory Management**: Efficient resource cleanup and cancellation

## 🚀 Getting Started

### Prerequisites
- Modern browser with WebAssembly support (Chrome 96+, Edge 96+)
- 250MB available memory for model download
- HTTPS or localhost for SharedArrayBuffer support

### Installation & Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Quick Start
1. Open `http://localhost:5173` in your browser
2. Wait for model initialization (first-time download ~250MB)
3. Paste your code and click "Optimize Code"
4. View results in Overview, Code, Diff, and Explain tabs

## 📁 Project Structure

```
OPTIMA/
├── src/
│   ├── components/
│   │   ├── CodeOptimizerTab.tsx      # Main UI component
│   │   ├── OverviewPanel.tsx          # Analysis overview
│   │   ├── ExplainPanel.tsx           # Detailed explanations
│   │   └── DiffViewer.tsx            # Code diff viewer
│   ├── workers/
│   │   └── optimizer_worker.ts       # Optimization engine
│   ├── lib/
│   │   ├── promptBuilder.ts           # Smart prompt construction
│   │   ├── staticAnalyzer.ts          # Code analysis
│   │   └── codeDiff.ts               # Diff utilities
│   ├── hooks/
│   │   └── useModelLoader.ts          # Model state management
│   └── styles/
│       └── index.css                  # Premium glassmorphism UI
├── index.html                         # App entry point
├── package.json                       # Dependencies & scripts
└── README.md                         # This file
```

## 🔧 Configuration

### Environment Variables
- `VITE_*`: Standard Vite environment variables
- Model downloads cached in browser storage automatically

### Build Configuration
- **Vite**: Modern build tool with hot reload
- **TypeScript**: Strict type checking and compilation
- **CSS**: Glassmorphism design system with CSS variables

## 🎨 Design System

### Visual Features
- **Glassmorphism**: Modern frosted glass effect
- **Dark/Light Themes**: Automatic theme detection
- **Responsive Design**: Works on all screen sizes
- **Micro-interactions**: Subtle animations and transitions
- **Loading States**: Comprehensive loading indicators and progress

### Color Palette
- **Primary**: Purple gradient (#7c6af7 → #3dd6f5)
- **Success**: Green (#22c55e)
- **Danger**: Red (#f87171)
- **Accent**: Cyan (#3dd6f5)
- **Text**: High contrast for readability

## 🔒 Security & Privacy

### Privacy Guarantees
- **100% Local Processing**: No code sent to external servers
- **No Data Collection**: No analytics or tracking
- **Temporary Storage**: Model cached only in browser storage
- **Secure Execution**: Sandboxed WebAssembly environment

### Security Features
- **Input Validation**: Safe code parsing and handling
- **Memory Bounds**: Configurable memory limits
- **Timeout Protection**: Prevents resource exhaustion
- **Error Handling**: Graceful failure recovery

## 🐛 Troubleshooting

### Common Issues
- **Model Loading**: Ensure sufficient memory and stable internet
- **WebAssembly**: Check browser compatibility and enable WASM
- **Performance**: Close other tabs to free up memory
- **CORS**: Use HTTPS or localhost for SharedArrayBuffer

### Debug Mode
- **Browser Console**: Press F12 for detailed error messages
- **Network Tab**: Monitor model download progress
- **Storage**: Clear browser cache if model corrupted

## 📈 Performance

### Benchmarks
- **Small Functions** (< 15 lines): ~2-5 seconds
- **Medium Algorithms** (15-40 lines): ~5-15 seconds  
- **Large Codebases** (40+ lines): ~10-30 seconds
- **Memory Usage**: ~250-350MB during inference

### Optimization Impact
- **Algorithmic**: O(n²) → O(n) improvements when possible
- **Memory**: Reduced allocations and better data structures
- **Readability**: Cleaner, more idiomatic code patterns

## 🤝 Contributing

### Development Guidelines
- **Performance First**: Prioritize user experience and speed
- **Type Safety**: Strict TypeScript usage throughout
- **Modern Patterns**: Use current React and JavaScript best practices
- **Component Architecture**: Maintainable, reusable components

### Code Style
- **Consistent Formatting**: Use project's ESLint configuration
- **Clear Naming**: Descriptive variable and function names
- **Documentation**: Comment complex logic and algorithms

## 📄 License

MIT License - See LICENSE file for details

---

**Built with ❤️ using RunAnywhere SDK - On-device AI that respects your privacy.**
