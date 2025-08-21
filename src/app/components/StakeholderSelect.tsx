'use client';

import { Stakeholder } from '@/types';

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
  return (
    <div className="space-y-3">
      {stakeholders.map((stakeholder) => (
        <div
          key={stakeholder.id}
          onClick={() => onSelect(stakeholder)}
          className={`p-4 rounded-lg border cursor-pointer transition-all
            ${selected?.id === stakeholder.id 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-200 hover:border-gray-300'}`}
        >
          <h3 className="font-semibold text-gray-900">{stakeholder.role}</h3>
          <div className="mt-2">
            <p className="text-sm text-gray-600">主な関心事:</p>
            <ul className="mt-1 text-sm text-gray-700 list-disc list-inside">
              {stakeholder.concerns.map((concern, index) => (
                <li key={index}>{concern}</li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}