import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { ChatMessage, ChatService, ChatUser } from '../../services/chat.service';

type ChatLevel = 'notes' | 'direct';

export interface ChatPerson extends ChatUser {
  online: boolean;
}

@Component({
  selector: 'app-chat',
  imports: [FormsModule, DatePipe],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Chat implements OnInit, OnDestroy {
  private readonly chatService = inject(ChatService);
  private readonly authService = inject(AuthService);
  private readonly subscriptions = new Subscription();

  readonly chatLevel = signal<ChatLevel>('notes');
  readonly connected = signal(false);
  readonly users = signal<ChatUser[]>([]);
  readonly messages = signal<ChatMessage[]>([]);
  readonly selectedUserId = signal('');
  readonly messageText = signal('');
  readonly error = signal('');
  readonly activeRoom = signal('admin:notes');
  readonly onlineIds = signal<string[]>([]);

  readonly me = this.authService.user;

  readonly people = computed<ChatPerson[]>(() => {
    const online = new Set(this.onlineIds());
    return this.users()
      .map((user) => ({ ...user, online: online.has(user._id) }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  });

  readonly onlineCount = computed(
    () => this.people().filter((person) => person.online).length + (this.connected() ? 1 : 0),
  );

  ngOnInit(): void {
    this.subscriptions.add(
      this.chatService.connectionStatus$.subscribe((connected) => {
        this.connected.set(connected);
        if (connected) {
          this.joinActiveRoom();
        }
      }),
    );

    this.subscriptions.add(
      this.chatService.connectionError$.subscribe((error) => {
        this.error.set(`No se pudo conectar al chat: ${error.message}`);
      }),
    );

    this.subscriptions.add(
      this.chatService.history$.subscribe((history) => {
        this.messages.set(history.filter((message) => message.room === this.activeRoom()));
      }),
    );

    this.subscriptions.add(
      this.chatService.messages$.subscribe((message) => {
        if (message.room === this.activeRoom()) {
          this.messages.update((messages) => [...messages, message]);
        }
      }),
    );

    this.subscriptions.add(
      this.chatService.onlineUsers$.subscribe((userIds) => this.onlineIds.set(userIds)),
    );

    this.subscriptions.add(
      this.chatService.chatError$.subscribe((error) => {
        this.error.set(error.message);
      }),
    );

    this.subscriptions.add(
      this.chatService.getUsers().subscribe({
        next: (users) => {
          const currentUserId = this.authService.user()?._id;
          // Filtramos para listar únicamente otros administradores en el canal interno
          this.users.set(
            users.filter(
              (user) =>
                user._id !== currentUserId &&
                (!user.role || user.role.toUpperCase() === 'ADMIN'),
            ),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.error.set(`No se pudo cargar la lista de administradores: ${error.message}`);
        },
      }),
    );

    try {
      this.chatService.connect();
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'No se pudo iniciar la conexión del chat.',
      );
    }
  }

  setChatLevel(level: ChatLevel): void {
    this.chatLevel.set(level);

    if (level === 'notes') {
      this.activeRoom.set('admin:notes');
    } else {
      this.activeRoom.set(this.directRoom());
    }

    this.messages.set([]);
    this.error.set('');
    this.joinActiveRoom();
  }

  selectDirectUser(userId: string): void {
    this.selectedUserId.set(userId);
    if (this.chatLevel() === 'direct') {
      this.activeRoom.set(this.directRoom());
      this.messages.set([]);
      this.joinActiveRoom();
    }
  }

  openDirect(userId: string): void {
    this.selectedUserId.set(userId);
    this.setChatLevel('direct');
  }

  sendMessage(): void {
    const text = this.messageText().trim();
    if (!text || !this.activeRoom() || !this.connected()) {
      return;
    }

    try {
      this.chatService.sendMessage(this.activeRoom(), text);
      this.messageText.set('');
      this.error.set('');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.chatService.disconnect();
  }

  private joinActiveRoom(): void {
    if (!this.connected() || !this.activeRoom()) {
      return;
    }

    try {
      this.chatService.joinRoom(this.activeRoom());
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo entrar en la sala.');
    }
  }

  private directRoom(): string {
    const currentUserId = this.authService.user()?._id;
    const otherUserId = this.selectedUserId();

    if (!currentUserId || !otherUserId) {
      return '';
    }

    const [firstId, secondId] = [currentUserId, otherUserId].sort();
    return `direct:${firstId}:${secondId}`;
  }
}