import type { Hotel } from '@hotelcut/schemas';
import {
  Boxes,
  ChevronDown,
  Clapperboard,
  FileClock,
  Film,
  Gauge,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Plus,
  Settings,
  Sparkles,
  WandSparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

export type WorkspaceSection =
  | 'ai-director'
  | 'assets'
  | 'audit'
  | 'brand'
  | 'dashboard'
  | 'projects'
  | 'renders'
  | 'settings'
  | 'templates';

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
  templatesEnabled?: boolean;
  userEmail?: string;
}

interface NavigationItem {
  ariaLabel: string;
  badge?: number | null;
  icon: LucideIcon;
  label: string;
  section: WorkspaceSection;
}

const primaryNavigation: NavigationItem[] = [
  { ariaLabel: '打开工作台', icon: Gauge, label: '工作台', section: 'dashboard' },
  { ariaLabel: '打开 AI 创作', icon: WandSparkles, label: 'AI 创作', section: 'ai-director' },
  { ariaLabel: '打开视频项目', icon: Film, label: '视频项目', section: 'projects' },
  { ariaLabel: '打开素材库', icon: Boxes, label: '素材库', section: 'assets' },
  { ariaLabel: '打开渲染中心', icon: Clapperboard, label: '渲染与交付', section: 'renders' },
];

const libraryNavigation: NavigationItem[] = [
  { ariaLabel: '打开模板中心', icon: Sparkles, label: '模板中心', section: 'templates' },
  { ariaLabel: '打开酒店配置', icon: Palette, label: '品牌资产', section: 'brand' },
];

const utilityNavigation: NavigationItem[] = [
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
              title={item.label}
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
  templatesEnabled = true,
  userEmail,
}: AppShellProps) {
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const withCounts = (items: NavigationItem[]) =>
    items.map((item) => ({
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
  const visibleLibraryNavigation = libraryNavigation.filter(
    (item) => templatesEnabled || item.section !== 'templates',
  );
  const allNavigation = [...primaryNavigation, ...visibleLibraryNavigation, ...utilityNavigation];
  const activeLabel =
    allNavigation.find((item) => item.section === activeSection)?.label ?? '工作台';

  return (
    <main className={`hotelcut-shell ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
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
          <button
            aria-label={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            className="shell-collapse-button"
            onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
            title={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            type="button"
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
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
          items={withCounts(primaryNavigation)}
          label="主要工作区"
          onNavigate={navigate}
        />
        <NavigationGroup
          activeSection={activeSection}
          items={visibleLibraryNavigation}
          label="资源与品牌"
          onNavigate={navigate}
        />
        <NavigationGroup
          activeSection={activeSection}
          items={utilityNavigation}
          label="系统"
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
          <div className="shell-view-title" aria-live="polite">
            <span>当前工作区</span>
            <strong>{activeLabel}</strong>
          </div>
          <div className="shell-topbar-spacer" />
          <button
            className="shell-create-button"
            onClick={() => navigate('ai-director')}
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
