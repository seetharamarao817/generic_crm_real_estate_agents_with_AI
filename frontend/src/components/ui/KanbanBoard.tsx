import React, { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { SortableColumn, SortableCard } from './KanbanSortables'

// Simplified generic type expectations for the kanban items
export interface KanbanColumn {
  id: string
  title: string
}

export interface KanbanItem {
  id: string
  columnId: string
  [key: string]: any
}

interface KanbanBoardProps {
  columns: KanbanColumn[]
  items: KanbanItem[]
  onItemMove: (itemId: string, newColumnId: string) => void
  renderCard: (item: KanbanItem) => React.ReactNode
}

export function KanbanBoard({ columns, items, onItemMove, renderCard }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  
  // Group items by column
  const itemsByColumn = columns.reduce((acc, col) => {
    acc[col.id] = items.filter(item => item.columnId === col.id)
    return acc
  }, {} as Record<string, KanbanItem[]>)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    // Handling moving cards between columns is done instantly on drag over
    const { active, over } = event
    if (!over) return

    const activeId = active.id
    const overId = over.id

    if (activeId === overId) return

    // Not triggering actual state changes here to keep it simple; 
    // real movement logic is bound in DragEnd, but for smooth UX we might 
    // want to implement optimisic arrays in a more complex setup.
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const activeItemId = active.id as string
    const overId = over.id as string

    const isOverColumn = over.data.current?.type === 'Column'
    
    // Find where we dropped it
    let newColumnId = ""

    if (isOverColumn) {
      newColumnId = overId
    } else {
      // Must be over another task
      const overItem = items.find(i => i.id === overId)
      if (overItem) newColumnId = overItem.columnId
    }

    const activeItem = items.find(i => i.id === activeItemId)
    if (activeItem && activeItem.columnId !== newColumnId && newColumnId !== "") {
      onItemMove(activeItemId, newColumnId)
    }
  }

  const activeItem = activeId ? items.find(i => i.id === activeId) : null

  return (
    <div className="flex h-full w-full overflow-x-auto gap-6 pb-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={columns.map(c => c.id)}
          strategy={horizontalListSortingStrategy}
        >
          {columns.map(col => (
            <SortableColumn key={col.id} column={col}>
              <SortableContext
                items={itemsByColumn[col.id].map(i => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-3 min-h-[150px]">
                  {itemsByColumn[col.id].map(item => (
                    <SortableCard key={item.id} item={item}>
                      {renderCard(item)}
                    </SortableCard>
                  ))}
                </div>
              </SortableContext>
            </SortableColumn>
          ))}
        </SortableContext>

        <DragOverlay>
          {activeItem ? (
            <div className="opacity-80 rotate-2 scale-105 transition-transform cursor-grabbing">
              {renderCard(activeItem)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
