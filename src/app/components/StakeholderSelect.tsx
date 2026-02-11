'use client';

import { Stakeholder } from '@/types';
import { useI18n } from './I18nProvider';
import { determineAdvancedRhetoricStrategy, getRhetoricStrategyDisplayName } from '@/lib/rhetoric-strategies';

interface StakeholderSelectProps {
  stakeholders: Stakeholder[];
  selected: Stakeholder | null;
  onSelect: (stakeholder: Stakeholder) => void;
}

export default function StakeholderSelect({ 
  stakeholders, 
  selected, 
  onSelect 
}: StakeholderSelectProps) {
  const { language } = useI18n();
  
  return (
    <div className="space-y-3">
      {stakeholders.map((stakeholder) => {
        const strategy = determineAdvancedRhetoricStrategy(stakeholder);
        const strategyDisplayName = getRhetoricStrategyDisplayName(strategy, stakeholder, language);
        
        return (
          <div
            key={stakeholder.id}
            onClick={() => onSelect(stakeholder)}
            className={`p-4 rounded-lg border cursor-pointer transition-all
              ${selected?.id === stakeholder.id 
                ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/50' 
                : 'border-gray-200 hover:border-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-gray-600'}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">{stakeholder.role}</h3>
              <span className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                {strategyDisplayName}
              </span>
            </div>
            <div className="mt-2">
              <p className="text-base text-gray-600 dark:text-gray-400">
                {language === 'en' ? 'Key concerns:' : '主な関心事:'}
              </p>
              <ul className="mt-1 text-base text-gray-700 dark:text-gray-300 list-disc list-inside">
                {stakeholder.concerns.map((concern, index) => (
                  <li key={index}>{concern}</li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}