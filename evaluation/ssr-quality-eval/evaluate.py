#!/usr/bin/env python3
"""
SSR (Safety Status Report) 品質評価スクリプト
LLM-as-a-Judge方式による自動評価（GPT-5.2 & Gemini 2.5 Flash & DeepSeek V3.2 & Claude Sonnet 4.5対応）

Reference: Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena", NeurIPS 2023
"""

import os
import json
import argparse
from datetime import datetime
from pathlib import Path
from typing import Optional
import re

# .envファイルの読み込み
try:
    from dotenv import load_dotenv
    # スクリプトと同じディレクトリの.envを読み込み
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        print(f"✓ .envファイルを読み込みました: {env_path}")
    else:
        # カレントディレクトリの.envも試行
        load_dotenv()
except ImportError:
    print("Warning: python-dotenv not installed. Run: pip install python-dotenv")

# API clients
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    print("Warning: openai package not installed. GPT-5.2 and DeepSeek V3.2 evaluation will not be available.")

try:
    from google import genai
    from google.genai import types as genai_types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("Warning: google-genai package not installed. Gemini 2.5 Flash evaluation will not be available.")

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    print("Warning: anthropic package not installed. Claude Sonnet 4.5 evaluation will not be available.")


# =============================================================================
# モデル設定（新しいモデルを追加する場合はここを編集）
# =============================================================================
MODEL_CONFIG = {
    "gpt5": {
        "display_name": "GPT-5.2",
        "api_type": "openai",
        "model_name": "gpt-5.2",
        "env_key": "OPENAI_API_KEY",
        "base_url": None,  # デフォルト（OpenAI）
    },
    "gemini": {
        "display_name": "Gemini 2.5 Flash",
        "api_type": "gemini",
        "model_name": "gemini-2.5-flash",
        "env_key": "GOOGLE_API_KEY",
        "base_url": None,
    },
    "deepseek": {
        "display_name": "DeepSeek V3.2",
        "api_type": "openai",  # OpenAI互換API
        "model_name": "deepseek-chat",
        "env_key": "DEEPSEEK_API_KEY",
        "base_url": "https://api.deepseek.com",
    },
    "claude": {
        "display_name": "Claude Sonnet 4.5",
        "api_type": "anthropic",
        "model_name": "claude-sonnet-4-5-20250929",
        "env_key": "ANTHROPIC_API_KEY",
        "base_url": None,
    },
}

# エイリアス（後方互換性のため）
MODEL_ALIASES = {
    "gpt4": "gpt5",
    "gpt-4": "gpt5",
    "gpt-5": "gpt5",
    "openai": "gpt5",
    "google": "gemini",
    "deepseek-v3": "deepseek",
    "anthropic": "claude",
    "sonnet": "claude",
    "claude-sonnet": "claude",
}


def get_model_key(model: str) -> str:
    """モデル名を正規化（エイリアス解決）"""
    model_lower = model.lower()
    return MODEL_ALIASES.get(model_lower, model_lower)


def get_model_display_name(model: str) -> str:
    """モデルの表示名を取得"""
    key = get_model_key(model)
    if key in MODEL_CONFIG:
        return MODEL_CONFIG[key]["display_name"]
    return model


class SSREvaluator:
    """SSR品質評価クラス"""
    
    def __init__(
        self,
        prompt_template_path: str = "prompt_template.txt",
        stakeholders_path: str = "stakeholders.json",
        inputs_dir: str = "inputs",
        outputs_dir: str = "outputs",
        results_dir: str = "results"
    ):
        self.prompt_template_path = Path(prompt_template_path)
        self.stakeholders_path = Path(stakeholders_path)
        self.inputs_dir = Path(inputs_dir)
        self.outputs_dir = Path(outputs_dir)
        self.results_dir = Path(results_dir)
        
        # ディレクトリ作成
        self.results_dir.mkdir(parents=True, exist_ok=True)
        
        # テンプレートとステークホルダー情報の読み込み
        self.prompt_template = self._load_template()
        self.stakeholders_config = self._load_stakeholders()
        
        # 入力ドキュメントの読み込み
        self.source_documents = self._load_source_documents()
        
        # APIクライアント初期化（遅延初期化）
        self._openai_clients = {}  # base_url別にキャッシュ
        self._gemini_client = None
        self._anthropic_client = None
        
    def _load_template(self) -> str:
        """プロンプトテンプレートを読み込み"""
        with open(self.prompt_template_path, "r", encoding="utf-8") as f:
            return f.read()
    
    def _load_stakeholders(self) -> dict:
        """ステークホルダー設定を読み込み"""
        with open(self.stakeholders_path, "r", encoding="utf-8") as f:
            return json.load(f)
    
    def _load_source_documents(self) -> str:
        """入力ソースドキュメントを読み込んで結合"""
        documents = []
        input_files = self.stakeholders_config.get("input_files", [])
        
        for filename in input_files:
            filepath = self.inputs_dir / filename
            if filepath.exists():
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                documents.append(f"### ファイル: {filename}\n\n{content}")
            else:
                print(f"Warning: Input file not found: {filepath}")
        
        return "\n\n---\n\n".join(documents)
    
    def _load_ssr(self, stakeholder_id: str) -> Optional[str]:
        """指定されたステークホルダーのSSRを読み込み"""
        stakeholder = None
        for s in self.stakeholders_config["stakeholders"]:
            if s["id"] == stakeholder_id:
                stakeholder = s
                break
        
        if not stakeholder:
            print(f"Error: Stakeholder '{stakeholder_id}' not found")
            return None
        
        ssr_filename = stakeholder.get("ssr_filename")
        if not ssr_filename:
            print(f"Error: SSR filename not specified for '{stakeholder_id}'")
            return None
        
        ssr_path = self.outputs_dir / ssr_filename
        if not ssr_path.exists():
            print(f"Error: SSR file not found: {ssr_path}")
            return None
        
        with open(ssr_path, "r", encoding="utf-8") as f:
            return f.read()
    
    def _build_prompt(self, stakeholder_id: str, ssr_content: str) -> Optional[str]:
        """評価プロンプトを構築"""
        stakeholder = None
        for s in self.stakeholders_config["stakeholders"]:
            if s["id"] == stakeholder_id:
                stakeholder = s
                break
        
        if not stakeholder:
            return None
        
        prompt = self.prompt_template
        prompt = prompt.replace("{stakeholder_name}", stakeholder["name"])
        prompt = prompt.replace("{stakeholder_role}", stakeholder["role"])
        prompt = prompt.replace("{concerns}", ", ".join(stakeholder["concerns"]))
        prompt = prompt.replace("{expertise_level}", stakeholder["expertise_level"])
        prompt = prompt.replace("{source_documents}", self.source_documents)
        prompt = prompt.replace("{generated_ssr}", ssr_content)
        
        return prompt
    
    def _get_openai_client(self, base_url: Optional[str], env_key: str) -> OpenAI:
        """OpenAI互換クライアントを取得（キャッシュ付き）"""
        if not OPENAI_AVAILABLE:
            raise RuntimeError("openai package is not installed")
        
        cache_key = base_url or "openai_default"
        
        if cache_key not in self._openai_clients:
            api_key = os.environ.get(env_key)
            if not api_key:
                raise ValueError(f"{env_key} environment variable is not set")
            
            if base_url:
                self._openai_clients[cache_key] = OpenAI(
                    api_key=api_key,
                    base_url=base_url
                )
            else:
                self._openai_clients[cache_key] = OpenAI(api_key=api_key)
        
        return self._openai_clients[cache_key]
    
    def _init_gemini(self):
        """Gemini クライアントを初期化"""
        if not GEMINI_AVAILABLE:
            raise RuntimeError("google-genai package is not installed")

        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY environment variable is not set")

        self._gemini_client = genai.Client(api_key=api_key)
    
    def _init_anthropic(self):
        """Anthropic クライアントを初期化"""
        if not ANTHROPIC_AVAILABLE:
            raise RuntimeError("anthropic package is not installed")
        
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
        
        self._anthropic_client = anthropic.Anthropic(api_key=api_key)
    
    def _call_openai_compatible(self, prompt: str, model_key: str) -> str:
        """OpenAI互換APIを呼び出し（GPT-5.2, DeepSeek等）"""
        config = MODEL_CONFIG[model_key]
        client = self._get_openai_client(config["base_url"], config["env_key"])
        
        response = client.chat.completions.create(
            model=config["model_name"],
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=0,  # 再現性のため
            max_completion_tokens=4096
        )
        
        return response.choices[0].message.content
    
    def _call_gemini(self, prompt: str) -> str:
        """Gemini APIを呼び出し"""
        if not hasattr(self, "_gemini_client") or not self._gemini_client:
            self._init_gemini()

        config = MODEL_CONFIG["gemini"]
        response = self._gemini_client.models.generate_content(
            model=config["model_name"],
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                temperature=0,
                max_output_tokens=8192
            )
        )

        return response.text
    
    def _call_anthropic(self, prompt: str, model_key: str) -> str:
        """Anthropic Claude APIを呼び出し"""
        if not self._anthropic_client:
            self._init_anthropic()
        
        config = MODEL_CONFIG[model_key]
        
        response = self._anthropic_client.messages.create(
            model=config["model_name"],
            max_tokens=4096,
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=0  # 再現性のため
        )
        
        return response.content[0].text
    
    def _call_model(self, prompt: str, model: str) -> str:
        """モデルAPIを呼び出し（統一インターフェース）"""
        model_key = get_model_key(model)
        
        if model_key not in MODEL_CONFIG:
            raise ValueError(f"Unknown model: {model}")
        
        config = MODEL_CONFIG[model_key]
        
        if config["api_type"] == "openai":
            return self._call_openai_compatible(prompt, model_key)
        elif config["api_type"] == "gemini":
            return self._call_gemini(prompt)
        elif config["api_type"] == "anthropic":
            return self._call_anthropic(prompt, model_key)
        else:
            raise ValueError(f"Unknown API type: {config['api_type']}")
    
    def _parse_json_response(self, response: str) -> Optional[dict]:
        """APIレスポンスからJSONを抽出してパース"""
        # ```json ブロックを抽出
        json_match = re.search(r'```json\s*([\s\S]*?)\s*```', response)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_str = response.strip()
            if not json_str.startswith('{'):
                start_idx = json_str.find('{')
                if start_idx != -1:
                    json_str = json_str[start_idx:]
            if not json_str.endswith('}'):
                end_idx = json_str.rfind('}')
                if end_idx != -1:
                    json_str = json_str[:end_idx + 1]
        
        # 最初のパース試行
        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"Initial JSON parse failed: {e}")
            
            # 修復を試みる
            repaired_json = self._repair_json(json_str)
            if repaired_json:
                try:
                    return json.loads(repaired_json)
                except json.JSONDecodeError as e2:
                    print(f"Repaired JSON parse also failed: {e2}")
            
            print(f"Response (first 1000 chars): {response[:1000]}...")
            return None
    
    def _repair_json(self, json_str: str) -> Optional[str]:
        """不完全なJSONを修復する試み"""
        # 開き括弧と閉じ括弧のカウント
        brace_count = 0
        bracket_count = 0
        in_string = False
        escape_next = False
        
        for char in json_str:
            if escape_next:
                escape_next = False
                continue
            if char == '\\':
                escape_next = True
                continue
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
            if in_string:
                continue
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
            elif char == '[':
                bracket_count += 1
            elif char == ']':
                bracket_count -= 1
        
        # 閉じ括弧が足りない場合は追加
        repaired = json_str
        
        # 末尾の不完全な文字列を閉じる
        if in_string:
            repaired += '"'
        
        # 足りない閉じ括弧を追加
        repaired += ']' * bracket_count
        repaired += '}' * brace_count
        
        return repaired if repaired != json_str else None
    
    def _calculate_total_score(self, result: dict) -> float:
        """スコアの平均を計算"""
        scores = result.get("scores", {})
        if not scores:
            return 0.0
        
        metric_scores = []
        for metric, data in scores.items():
            if isinstance(data, dict) and "score" in data:
                score = data["score"]
                if isinstance(score, (int, float)) and 1 <= score <= 5:
                    metric_scores.append(score)
        
        if not metric_scores:
            return 0.0
        
        return round(sum(metric_scores) / len(metric_scores), 2)
    
    def evaluate_single(
        self,
        stakeholder_id: str,
        model: str = "gpt5"
    ) -> Optional[dict]:
        """単一のSSRを評価"""
        model_display = get_model_display_name(model)
        print(f"Evaluating SSR for: {stakeholder_id} using {model_display}")
        
        ssr_content = self._load_ssr(stakeholder_id)
        if not ssr_content:
            return None
        
        prompt = self._build_prompt(stakeholder_id, ssr_content)
        if not prompt:
            return None
        
        try:
            response = self._call_model(prompt, model)
        except Exception as e:
            print(f"Error calling API: {e}")
            return None
        
        result = self._parse_json_response(response)
        if result:
            result["model"] = model_display
            result["evaluated_at"] = datetime.now().isoformat()
            result["total_score"] = self._calculate_total_score(result)
            result["raw_response"] = response
        
        return result
    
    def evaluate_all(self, model: str = "gpt5") -> dict:
        """全ステークホルダーのSSRを評価"""
        model_display = get_model_display_name(model)
        results = {
            "model": model_display,
            "evaluated_at": datetime.now().isoformat(),
            "evaluations": []
        }
        
        for stakeholder in self.stakeholders_config["stakeholders"]:
            stakeholder_id = stakeholder["id"]
            print(f"\n{'='*50}")
            print(f"Evaluating: {stakeholder['name']}")
            print(f"{'='*50}")
            
            result = self.evaluate_single(stakeholder_id, model)
            if result:
                result.pop("raw_response", None)
                results["evaluations"].append(result)
                
                if "scores" in result:
                    print(f"Total Score: {result.get('total_score', 'N/A')}")
                    for metric, data in result["scores"].items():
                        print(f"  {metric}: {data.get('score', 'N/A')}")
            else:
                print(f"Failed to evaluate {stakeholder_id}")
        
        return results
    
    def save_results(self, results: dict, filename: str):
        """評価結果をJSONファイルに保存"""
        filepath = self.results_dir / filename
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"\nResults saved to: {filepath}")
    
    def generate_report(self, results: dict) -> str:
        """評価結果からレポートを生成"""
        report_lines = [
            "# SSR品質評価レポート",
            "",
            f"**評価モデル:** {results.get('model', 'N/A')}",
            f"**評価日時:** {results.get('evaluated_at', 'N/A')}",
            "",
            "## 評価結果サマリー",
            "",
            "| ステークホルダー | 総合スコア | Faithfulness | Consistency | Coherence | Answer Relevance | Fluency | Relevance | Informativeness | Simplification | GSN Alignment |",
            "|-----------------|-----------|--------------|-------------|-----------|------------------|---------|-----------|-----------------|----------------|---------------|"
        ]
        
        for eval_result in results.get("evaluations", []):
            stakeholder = eval_result.get("stakeholder", "N/A")
            total_score = eval_result.get("total_score", "N/A")
            scores = eval_result.get("scores", {})
            
            row = f"| {stakeholder} | {total_score} |"
            for metric in ["faithfulness", "consistency", "coherence", "answer_relevance", 
                          "fluency", "relevance", "informativeness", "simplification", "gsn_alignment"]:
                score = scores.get(metric, {}).get("score", "N/A")
                row += f" {score} |"
            
            report_lines.append(row)
        
        report_lines.extend([
            "",
            "## 詳細評価",
            ""
        ])
        
        for eval_result in results.get("evaluations", []):
            stakeholder = eval_result.get("stakeholder", "N/A")
            report_lines.extend([
                f"### {stakeholder}",
                "",
                f"**総合スコア:** {eval_result.get('total_score', 'N/A')}",
                "",
                f"**総合評価:** {eval_result.get('summary', 'N/A')}",
                "",
                "| 指標 | スコア | 根拠 |",
                "|------|--------|------|"
            ])
            
            scores = eval_result.get("scores", {})
            for metric, data in scores.items():
                score = data.get("score", "N/A")
                reason = data.get("reason", "N/A").replace("|", "｜")
                report_lines.append(f"| {metric} | {score} | {reason} |")
            
            report_lines.append("")
        
        return "\n".join(report_lines)


def main():
    # 利用可能なモデル一覧を生成
    model_choices = list(MODEL_CONFIG.keys()) + ["all"]
    model_help = ", ".join([f"{k}={v['display_name']}" for k, v in MODEL_CONFIG.items()])
    
    parser = argparse.ArgumentParser(
        description="SSR品質評価スクリプト (LLM-as-a-Judge) - GPT-5.2 & Gemini 2.5 Flash & DeepSeek V3.2 & Claude Sonnet 4.5対応"
    )
    parser.add_argument(
        "--model",
        choices=model_choices,
        default="gpt5",
        help=f"評価に使用するモデル: {model_help}, all=全モデル (default: gpt5)"
    )
    parser.add_argument(
        "--stakeholder",
        type=str,
        default=None,
        help="特定のステークホルダーのみ評価 (例: rd, cxo)"
    )
    parser.add_argument(
        "--prompt-template",
        type=str,
        default="prompt_template.txt",
        help="プロンプトテンプレートのパス"
    )
    parser.add_argument(
        "--stakeholders-config",
        type=str,
        default="stakeholders.json",
        help="ステークホルダー設定ファイルのパス"
    )
    parser.add_argument(
        "--inputs-dir",
        type=str,
        default="inputs",
        help="入力ファイルのディレクトリ"
    )
    parser.add_argument(
        "--outputs-dir",
        type=str,
        default="outputs",
        help="SSR出力ファイルのディレクトリ"
    )
    parser.add_argument(
        "--results-dir",
        type=str,
        default="results",
        help="評価結果の出力ディレクトリ"
    )
    parser.add_argument(
        "--output-report",
        action="store_true",
        help="Markdownレポートも出力する"
    )
    
    args = parser.parse_args()
    
    # 評価器を初期化
    evaluator = SSREvaluator(
        prompt_template_path=args.prompt_template,
        stakeholders_path=args.stakeholders_config,
        inputs_dir=args.inputs_dir,
        outputs_dir=args.outputs_dir,
        results_dir=args.results_dir
    )
    
    # モデルリストを作成
    if args.model == "all":
        models = list(MODEL_CONFIG.keys())
    else:
        models = [args.model]
    
    for model in models:
        model_display = get_model_display_name(model)
        print(f"\n{'#'*60}")
        print(f"# Evaluation with {model_display}")
        print(f"{'#'*60}")
        
        if args.stakeholder:
            result = evaluator.evaluate_single(args.stakeholder, model)
            if result:
                result.pop("raw_response", None)
                results = {
                    "model": model_display,
                    "evaluated_at": datetime.now().isoformat(),
                    "evaluations": [result]
                }
            else:
                print(f"Failed to evaluate {args.stakeholder}")
                continue
        else:
            results = evaluator.evaluate_all(model)
        
        # 結果を保存
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        model_key = get_model_key(model)
        filename = f"eval_{model_key}_{timestamp}.json"
        evaluator.save_results(results, filename)
        
        # レポートを生成
        if args.output_report:
            report = evaluator.generate_report(results)
            report_filename = f"eval_{model_key}_{timestamp}_report.md"
            report_path = evaluator.results_dir / report_filename
            with open(report_path, "w", encoding="utf-8") as f:
                f.write(report)
            print(f"Report saved to: {report_path}")


if __name__ == "__main__":
    main()