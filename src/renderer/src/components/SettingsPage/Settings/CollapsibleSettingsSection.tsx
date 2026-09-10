import { useCallback, useState, type ReactNode } from 'react';
import { useSettingsCollapse, type SettingsSectionKey } from './SettingsCollapseContext';

export interface CollapsibleSettingsSectionProps {
  id: string;
  sectionKey: SettingsSectionKey;
  title: ReactNode;
  iconName?: string;
  iconClassName?: string;
  className?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export const CollapsibleSettingsSection = ({
  id,
  sectionKey,
  title,
  iconName,
  iconClassName = '',
  className = '',
  defaultExpanded = true,
  children
}: CollapsibleSettingsSectionProps) => {
  const context = useSettingsCollapse();
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);

  const isExpanded = context ? context.isSectionExpanded(sectionKey) : localExpanded;

  const handleToggle = useCallback(() => {
    if (context) {
      context.toggleSection(sectionKey);
    } else {
      setLocalExpanded((prev) => !prev);
    }
  }, [context, sectionKey]);

  return (
    <li
      className={`main-container ${className} transition-all duration-200 ${
        isExpanded ? 'mb-16' : 'mb-6'
      }`}
      id={id}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="title-container text-font-color-highlight dark:text-dark-font-color-highlight group mt-1 mb-4 flex w-full cursor-pointer items-center justify-between text-left text-2xl font-medium focus-visible:outline-none"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center">
          {iconName && (
            <span className={`material-icons-round-outlined mr-2 ${iconClassName}`}>
              {iconName}
            </span>
          )}
          <span>{title}</span>
        </div>
        <span
          className={`material-icons-round text-font-color-dim dark:text-dark-font-color-dim group-hover:text-font-color-highlight dark:group-hover:text-dark-font-color-highlight text-2xl transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : 'rotate-0'
          }`}
        >
          expand_more
        </span>
      </button>

      {isExpanded && children}
    </li>
  );
};

export default CollapsibleSettingsSection;
