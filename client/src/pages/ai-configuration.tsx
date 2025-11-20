import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Brain, Zap, Settings, TestTube, CheckCircle, AlertCircle } from 'lucide-react';
import Sidebar from '@/components/layout/sidebar';
import Topbar from '@/components/layout/topbar';

const aiConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'gemini', 'disabled']),
  model: z.string().min(1, 'Model is required'),
  apiKey: z.string().min(1, 'API key is required'),
  maxTokens: z.number().min(100).max(4000).default(1000),
  temperature: z.number().min(0).max(2).default(0.3),
  useAI: z.boolean().default(false),
  fallbackToRegex: z.boolean().default(true),
  customPrompt: z.string().optional(),
});

type AIConfig = z.infer<typeof aiConfigSchema>;

const AI_PROVIDERS = {
  anthropic: {
    name: 'Anthropic Claude',
    models: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-haiku-20240307'],
    description: 'Advanced reasoning and context understanding',
    icon: '🧠',
  },
  openai: {
    name: 'OpenAI GPT',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    description: 'Powerful language understanding and generation',
    icon: '🤖',
  },
  gemini: {
    name: 'Google Gemini',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    description: 'Multimodal AI with strong analytical capabilities',
    icon: '✨',
  },
  disabled: {
    name: 'Disabled (Regex Only)',
    models: ['regex-parser'],
    description: 'Use only regex pattern matching',
    icon: '🔧',
  },
};

export default function AIConfiguration() {
  const [testResult, setTestResult] = useState<any>(null);
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const form = useForm<AIConfig>({
    resolver: zodResolver(aiConfigSchema),
    defaultValues: {
      provider: 'disabled',
      model: 'regex-parser',
      apiKey: '',
      maxTokens: 1000,
      temperature: 0.3,
      useAI: false,
      fallbackToRegex: true,
      customPrompt: '',
    },
  });

  const selectedProvider = form.watch('provider');
  const useAI = form.watch('useAI');

  const onSubmit = async (data: AIConfig) => {
    try {
      const response = await fetch('/api/ai/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        // Configuration saved successfully
        alert('AI configuration saved successfully!');
      } else {
        alert('Failed to save configuration');
      }
    } catch (error) {
      alert('Error saving configuration');
    }
  };

  const testAIParser = async () => {
    const testMessage = `♨126234 g blue $102500 N6
♨126505 cho HKD433000 N5
♨F.P.J CHRONOMÈTRE À RÉSONANCE platinum 2023 NEW Full Set HKD 2.30m`;

    setIsTestingAI(true);
    setAiStatus('testing');

    try {
      const response = await fetch('/api/ai/test-parser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: testMessage,
          config: form.getValues(),
        }),
      });

      const result = await response.json();
      setTestResult(result);
      setAiStatus(response.ok ? 'success' : 'error');
    } catch (error) {
      setAiStatus('error');
      setTestResult({ error: 'Failed to test AI parser' });
    } finally {
      setIsTestingAI(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar 
          title="AI Configuration" 
          subtitle="Configure AI-powered watch message parsing" 
          showSearchAndExport={false} 
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6">
          <div className="container mx-auto space-y-6">
            <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">AI Configuration</h1>
          <p className="text-gray-600 dark:text-gray-400">Configure AI models to enhance watch message parsing</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${
            aiStatus === 'success' ? 'bg-green-500' : 
            aiStatus === 'testing' ? 'bg-yellow-500' : 
            aiStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
          }`}></div>
          <span className="text-sm font-medium">
            {aiStatus === 'success' ? 'AI Ready' : 
             aiStatus === 'testing' ? 'Testing...' : 
             aiStatus === 'error' ? 'Error' : 'Not Configured'}
          </span>
        </div>
      </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Provider Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5" />
                <span>AI Provider</span>
              </CardTitle>
              <CardDescription>
                Choose an AI provider to enhance watch parsing accuracy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="useAI"
                  {...form.register('useAI')}
                />
                <Label htmlFor="useAI">Enable AI-powered parsing</Label>
              </div>

              <div className="space-y-2">
                <Label>AI Provider</Label>
                <Select
                  value={selectedProvider}
                  onValueChange={(value) => {
                    form.setValue('provider', value as any);
                    if (value !== 'disabled') {
                      form.setValue('model', AI_PROVIDERS[value as keyof typeof AI_PROVIDERS].models[0]);
                    }
                  }}
                  disabled={!useAI}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select AI provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AI_PROVIDERS).map(([key, provider]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center space-x-2">
                          <span>{provider.icon}</span>
                          <div>
                            <div className="font-medium">{provider.name}</div>
                            <div className="text-sm text-gray-500">{provider.description}</div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProvider !== 'disabled' && (
                <>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select
                      value={form.watch('model')}
                      onValueChange={(value) => form.setValue('model', value)}
                      disabled={!useAI}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_PROVIDERS[selectedProvider as keyof typeof AI_PROVIDERS].models.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="Enter your API key"
                      {...form.register('apiKey')}
                      disabled={!useAI}
                    />
                    {form.formState.errors.apiKey && (
                      <p className="text-sm text-red-600">{form.formState.errors.apiKey.message}</p>
                    )}
                  </div>
                </>
              )}

              <div className="flex items-center space-x-2">
                <Switch
                  id="fallbackToRegex"
                  {...form.register('fallbackToRegex')}
                />
                <Label htmlFor="fallbackToRegex">Fallback to regex if AI fails</Label>
              </div>
            </CardContent>
          </Card>

          {/* AI Parameters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5" />
                <span>AI Parameters</span>
              </CardTitle>
              <CardDescription>
                Fine-tune AI behavior for better parsing results
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Max Tokens: {form.watch('maxTokens')}</Label>
                <Slider
                  value={[form.watch('maxTokens')]}
                  onValueChange={(value) => form.setValue('maxTokens', value[0])}
                  min={100}
                  max={4000}
                  step={100}
                  disabled={!useAI || selectedProvider === 'disabled'}
                />
                <p className="text-sm text-gray-500">Maximum tokens for AI response</p>
              </div>

              <div className="space-y-2">
                <Label>Temperature: {form.watch('temperature')}</Label>
                <Slider
                  value={[form.watch('temperature')]}
                  onValueChange={(value) => form.setValue('temperature', value[0])}
                  min={0}
                  max={2}
                  step={0.1}
                  disabled={!useAI || selectedProvider === 'disabled'}
                />
                <p className="text-sm text-gray-500">Controls randomness (0 = deterministic, 2 = creative)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customPrompt">Custom Prompt (Optional)</Label>
                <Textarea
                  id="customPrompt"
                  placeholder="Add custom instructions for AI parsing..."
                  rows={3}
                  {...form.register('customPrompt')}
                  disabled={!useAI || selectedProvider === 'disabled'}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Test AI Parser */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TestTube className="h-5 w-5" />
              <span>Test AI Parser</span>
            </CardTitle>
            <CardDescription>
              Test your AI configuration with sample watch messages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex space-x-2">
              <Button
                type="button"
                onClick={testAIParser}
                disabled={isTestingAI || !useAI || selectedProvider === 'disabled'}
              >
                {isTestingAI ? 'Testing...' : 'Test AI Parser'}
              </Button>
              <Button type="submit">
                Save Configuration
              </Button>
            </div>

            {testResult && (
              <div className="space-y-2">
                <Label>Test Results</Label>
                <pre className="p-3 bg-gray-100 dark:bg-gray-800 rounded text-sm overflow-x-auto">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Benefits */}
        <Card>
          <CardHeader>
            <CardTitle>AI vs Regex Comparison</CardTitle>
            <CardDescription>
              Understanding the benefits of AI-powered parsing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-green-600">✅ AI-Powered Parsing</h4>
                <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
                  <li>• Resolves ambiguous references (126234 → 126234-0014)</li>
                  <li>• Understands context ("blue" → specific variant)</li>
                  <li>• Handles typos and variations</li>
                  <li>• Learns from database patterns</li>
                  <li>• Extracts complex watch details</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-orange-600">⚠️ Regex-Only Parsing</h4>
                <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
                  <li>• Pattern matching only</li>
                  <li>• No context understanding</li>
                  <li>• Rigid format requirements</li>
                  <li>• Cannot resolve ambiguities</li>
                  <li>• Limited to predefined patterns</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}