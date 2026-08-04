import type { Hotel } from '@hotelcut/schemas';
import {
  Boxes,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  FileClock,
  Film,
  Gauge,
  LogOut,
  Menu,
  Palette,
  Plus,
  Search,
  Settings,
  Sparkles,
  WandSparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

export type WorkspaceSection =
  'assets' | 'audit' | 'brand' | 'dashboard' | 'projects' | 'renders' | 'settings' | 'templates';

interface AppShellProps {
  activeSection: WorkspaceSection;
  assetCount: number | null;
  children: ReactNode;
  hotel: Hotel;
  onBack: () => void;
  onLogout?: () => void;
  onNavigate: (section: WorkspaceSection) => void;
  organizationName: string;
  projectCount: number | null;
  userEmail?: string;
}

interface NavigationItem {
  ariaLabel: string;
  badge?: number | null;
  icon: LucideIcon;
  label: string;
  section: WorkspaceSection;
}

const creationNavigation: NavigationItem[] = [
  { ariaLabel: '打开工作台', icon: Gauge, label: '工作台', section: 'dashboard' },
  { ariaLabel: '打开视频项目', icon: Film, label: '视频项目', section: 'projects' },
  { ariaLabel: '打开素材库', icon: Boxes, label: '素材库', section: 'assets' },
  { ariaLabel: '打开模板中心', icon: Sparkles, label: '模板中心', section: 'templates' },
];

const operationsNavigation: NavigationItem[] = [
  { ariaLabel: '打开酒店配置', icon: Palette, label: '酒店与品牌', section: 'brand' },
  { ariaLabel: '打开渲染中心', icon: Clapperboard, label: '渲染中心', section: 'renders' },
  { ariaLabel: '打开操作记录', icon: FileClock, label: '操作记录', section: 'audit' },
  { ariaLabel: '打开设置', icon: Settings, label: '设置', section: 'settings' },
];

function NavigationGroup({
  activeSection,
  items,
  label,
  onNavigate,
}: {
  activeSection: WorkspaceSection;
  items: NavigationItem[];
  label: string;
  onNavigate: (section: WorkspaceSection) => void;
}) {
  return (
    <div className="shell-nav-group">
      <p className="shell-nav-label">{label}</p>
      <div className="shell-nav-list">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              aria-current={activeSection === item.section ? 'page' : undefined}
              aria-label={item.ariaLabel}
              className={`shell-nav-item ${activeSection === item.section ? 'is-active' : ''}`}
              key={item.section}
              onClick={() => onNavigate(item.section)}
              type="button"
            >
              <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge !== null ? (
                <span className="shell-nav-badge">{item.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AppShell({
  activeSection,
  assetCount,
  children,
  hotel,
  onBack,
  onLogout,
  onNavigate,
  organizationName,
  projectCount,
  userEmail,
}: AppShellProps) {
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const creationItems = creationNavigation.map((item) => ({
    ...item,
    ...(item.section === 'assets'
      ? { badge: assetCount }
      : item.section === 'projects'
        ? { badge: projectCount }
        : {}),
  }));

  const navigate = (section: WorkspaceSection) => {
    onNavigate(section);
    setIsMobileNavigationOpen(false);
  };

  return (
    <main className="hotelcut-shell">
      <button
        aria-label="关闭导航"
        className={`shell-scrim ${isMobileNavigationOpen ? 'is-visible' : ''}`}
        onClick={() => setIsMobileNavigationOpen(false)}
        type="button"
      />
      <aside
        aria-label="酒店工作空间模块"
        className={`shell-sidebar ${isMobileNavigationOpen ? 'is-open' : ''}`}
      >
        <div className="shell-brand">
          <span className="shell-brand-mark" aria-hidden="true">
            H
          </span>
          <span>
            <strong>HotelCut</strong>
            <small>AI VIDEO WORKSPACE</small>
          </span>
          <button
            aria-label="关闭导航菜单"
            className="shell-mobile-close"
            onClick={() => setIsMobileNavigationOpen(false)}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <button
          aria-label="返回酒店列表"
          className="shell-hotel-switch"
          onClick={onBack}
          type="button"
        >
          <span className="shell-hotel-mark" aria-hidden="true">
            云
          </span>
          <span className="shell-hotel-copy">
            <strong>{hotel.name}</strong>
            <small>{organizationName}</small>
          </span>
          <ChevronDown aria-hidden="true" size={15} />
        </button>

        <NavigationGroup
          activeSection={activeSection}
          items={creationItems}
          label="创作工作区"
          onNavigate={navigate}
        />
        <NavigationGroup
          activeSection={activeSection}
          items={operationsNavigation}
          label="酒店运营"
          onNavigate={navigate}
        />

        <div className="shell-sidebar-footer">
          <div className="shell-capacity-card">
            <div>
              <span>生产状态</span>
              <strong>{assetCount === null ? '同步中' : `${assetCount} 份素材`}</strong>
            </div>
            <div className="shell-capacity-track" aria-hidden="true">
              <span
                style={{ width: assetCount ? `${Math.min(100, 18 + assetCount * 2)}%` : '12%' }}
              />
            </div>
            <button onClick={() => navigate('assets')} type="button">
              管理素材
            </button>
          </div>
          <div className="shell-user">
            <span className="shell-user-avatar">AO</span>
            <span>
              <strong>运营管理员</strong>
              <small>{userEmail ?? '已登录'}</small>
            </span>
            {onLogout ? (
              <button aria-label="退出登录" onClick={onLogout} type="button">
                <LogOut size={15} />
              </button>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="shell-main">
        <header className="shell-topbar">
          <button
            aria-label="打开导航菜单"
            className="shell-menu-button"
            onClick={() => setIsMobileNavigationOpen(true)}
            type="button"
          >
            <Menu size={19} />
          </button>
          <div className="shell-breadcrumb">
            <span>{organizationName}</span>
            <i>/</i>
            <strong>{hotel.name}</strong>
          </div>
          <div className="shell-topbar-spacer" />
          <label className="shell-global-search">
            <Search aria-hidden="true" size={14} />
            <span className="sr-only">全局搜索</span>
            <input
              disabled
              placeholder="全局搜索待索引服务接入"
              title="全局搜索将在索引服务接入后开放"
              type="search"
            />
            <kbd>⌘ K</kbd>
          </label>
          <button
            aria-label="帮助（待接入）"
            className="shell-icon-button"
            disabled
            title="帮助中心待接入"
            type="button"
          >
            <CircleHelp size={17} />
          </button>
          <button
            aria-label="AI 助手（待接入）"
            className="shell-icon-button shell-ai-button"
            disabled
            title="AI 助手待接入"
            type="button"
          >
            <WandSparkles size={17} />
          </button>
          <button
            className="shell-create-button"
            onClick={() => navigate('projects')}
            type="button"
          >
            <Plus size={15} />
            创建视频
          </button>
        </header>
        <div className="shell-content">{children}</div>
      </section>
    </main>
  );
}
