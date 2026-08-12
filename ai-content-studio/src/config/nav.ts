import {
  LayoutDashboard as LayoutDashboardIcon,
  PenLine as PenLineIcon,
  FileText as FileTextIcon,
  Cpu as CpuIcon,
  MessageSquareText as MessageSquareTextIcon,
  Workflow as WorkflowIcon,
  Search as SearchIcon,
  Send as SendIcon,
  ChartColumn as ChartColumnIcon,
  Link as LinkIcon,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

export const navItems: NavItem[] = [
  {
    title: "仪表盘",
    href: "/dashboard",
    icon: LayoutDashboardIcon,
    description: "总览与 AI 使用概况",
  },
  { title: "AI Studio", href: "/studio", icon: PenLineIcon, description: "AI 辅助创作工作台" },
  { title: "文章管理", href: "/articles", icon: FileTextIcon, description: "草稿与已发布文章" },
  { title: "AI 模型", href: "/providers", icon: CpuIcon, description: "供应商与模型管理" },
  { title: "Prompt", href: "/prompts", icon: MessageSquareTextIcon, description: "提示词模板库" },
  {
    title: "工作流",
    href: "/workflows",
    icon: WorkflowIcon,
    description: "自动化内容生产流（Phase 3）",
  },
  { title: "SEO", href: "/seo", icon: SearchIcon, description: "SEO 分析（Phase 2）" },
  { title: "发布", href: "/publish", icon: SendIcon, description: "WordPress 发布（Phase 2）" },
  { title: "统计", href: "/analytics", icon: ChartColumnIcon, description: "数据分析（Phase 2）" },
  {
    title: "来源库",
    href: "/sources",
    icon: LinkIcon,
    description: "外部来源采集（AI Research & Rewrite）",
  },
  { title: "设置", href: "/settings", icon: SettingsIcon, description: "系统设置" },
];
