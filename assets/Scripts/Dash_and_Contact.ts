import { _decorator, Component, Node, Input, input, EventKeyboard, KeyCode, Vec2, RigidBody2D, v2, Collider2D, Contact2DType, IPhysics2DContact, misc } from 'cc';
import { TimeTravelManager } from './TimeTravelManager';
const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {

    @property({ group: "Movement", tooltip: "普通移动速度" })
    moveSpeed: number = 10;

    @property({ group: "Movement", tooltip: "跳跃力度" })
    jumpForce: number = 18;

    @property({ group: "Dash", tooltip: "冲刺速度" })
    dashSpeed: number = 25;

    @property({ group: "Dash", tooltip: "冲刺持续时间" })
    dashDuration: number = 0.15;

    @property({ group: "Feel", tooltip: "土狼时间 (秒): 离开平台后多久内仍可起跳" })
    coyoteTime: number = 0.1;

    @property(TimeTravelManager)
    timeTravelManager: TimeTravelManager = null;

    // --- 内部变量 ---
    private rb: RigidBody2D = null!;
    private inputDir: Vec2 = v2(0, 0);
    private facingDir: number = 1;
    
    // 状态标记
    private isDashing: boolean = false;
    private canDash: boolean = true;
    
    // 地面检测与土狼时间
    private groundContactSet: Set<string> = new Set(); // 记录当前踩着的物体ID
    private coyoteTimer: number = 0; // 当前土狼时间剩余计时

    onLoad() {
        this.rb = this.getComponent(RigidBody2D)!;
        
        // 输入监听
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
        
        // 碰撞监听 (只在 Player 上监听即可)
        const collider = this.getComponent(Collider2D);
        if (collider) {
            collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            collider.on(Contact2DType.END_CONTACT, this.onEndContact, this);
            console.log('开始监听碰撞');
        }
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
        const collider = this.getComponent(Collider2D);
        if (collider) {
            collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            collider.off(Contact2DType.END_CONTACT, this.onEndContact, this);
        }
    }

    update(dt: number) {
        if (this.isDashing) return;
        // 更新土狼时间计时器
        if (this.coyoteTimer > 0) {
            this.coyoteTimer -= dt;
        }

        

        this.handleMovement();
    }

    private onKeyDown(event: EventKeyboard) {
        switch(event.keyCode) {
            case KeyCode.KEY_A: this.inputDir.x = -1; break;
            case KeyCode.KEY_D: this.inputDir.x = 1; break;
            case KeyCode.KEY_W: this.inputDir.y = 1; break;
            case KeyCode.KEY_S: this.inputDir.y = -1; break;
            
            case KeyCode.SPACE: // 跳跃键
            case KeyCode.KEY_J: 
                this.tryJump();
                break;

            case KeyCode.KEY_K: // 冲刺键
                this.tryDash();
                break;

            case KeyCode.SHIFT_LEFT:
                this.timeTravelManager.tryTimeTravel();
                break;
        }
    }

    private onKeyUp(event: EventKeyboard) {
        switch(event.keyCode) {
            case KeyCode.KEY_A: if (this.inputDir.x < 0) this.inputDir.x = 0; break;
            case KeyCode.KEY_D: if (this.inputDir.x > 0) this.inputDir.x = 0; break;
            case KeyCode.KEY_W: if (this.inputDir.y > 0) this.inputDir.y = 0; break;
            case KeyCode.KEY_S: if (this.inputDir.y < 0) this.inputDir.y = 0; break;
        }
    }

    private handleMovement() {
        if (this.inputDir.x !== 0) {
            this.facingDir = this.inputDir.x;
            this.node.setScale(this.facingDir, 1, 1);
        }
        const currentVel = this.rb.linearVelocity;
        this.rb.linearVelocity = v2(this.inputDir.x * this.moveSpeed, currentVel.y);
    }

    // --- 跳跃逻辑 (集成土狼时间) ---
    private tryJump() {
        // 判断条件：物理上在地面 OR 在土狼时间内
        const isGrounded = this.groundContactSet.size > 0;
        const canJump = isGrounded || this.coyoteTimer > 0;

        if (canJump) {
            console.log('[Debug] trying jump')
            const vel = this.rb.linearVelocity;
            this.rb.linearVelocity = v2(vel.x, this.jumpForce);
            
            // 跳跃后立即消耗掉土狼时间，防止连跳
            this.coyoteTimer = 0;
            // 某些逻辑下，跳跃离开地面的瞬间需要手动清空 contactSet，
            // 但物理引擎会在下一帧 EndContact，所以通常这里不需要强制清空，除非追求极致严谨。
        } else {
            console.log('[WARN] Cannot Jump!')
        }
    }

    // --- 冲刺逻辑 (保持不变) ---
    private tryDash() {
        if (!this.canDash) return;
        this.startDash();
    }

    private startDash() {
        this.isDashing = true;
        this.canDash = false; 

        let dashDir = this.inputDir.clone();
        if (dashDir.x === 0 && dashDir.y === 0) dashDir.x = this.facingDir;
        dashDir.normalize();

        this.rb.gravityScale = 0;
        this.rb.linearVelocity = dashDir.multiplyScalar(this.dashSpeed);

        this.scheduleOnce(this.endDash, this.dashDuration);
    }

    private endDash() {
        this.isDashing = false;
        this.rb.gravityScale = 3; // 恢复重力 (建议值3-5)
        this.rb.linearVelocity = this.rb.linearVelocity.multiplyScalar(0.5);
    }

    // --- 核心：法线检测与地面判断 ---
    
    // 只有法线朝上的碰撞才算“地面”
    private isValidGroundNormal(contact: IPhysics2DContact, selfCollider: Collider2D): boolean {
        const worldManifold = contact.getWorldManifold();
        const normal = worldManifold.normal; // 法线方向通常是从 A 指向 B

        // 报错修正说明：
        // 1. IPhysics2DContact 中没有 shapeA/B，只有 colliderA/colliderB
        // 2. Collider2D 中没有 shape 属性
        // 3. 逻辑：直接对比 selfCollider 是否等于 contact.colliderA

        if (selfCollider === contact.colliderA) {
            // 情况 1: 主角是 A，其他物体是 B。
            // 此时 normal 是从 主角 -> 指向 -> 地面 (方向向下)。
            // 我们需要判定地面是否在脚下，所以法线 Y 应该是负数 (比如 -1)。
            // 阈值 -0.7 相当于允许约 45 度的坡度。
            return normal.y < -0.7; 
        } else {
            // 情况 2: 主角是 B，其他物体是 A。
            // 此时 normal 是从 地面 -> 指向 -> 主角 (方向向上)。
            // 这正是我们需要地面的支撑方向，Y 应该是正数。
            return normal.y > 0.7;
        }
    }

    private onBeginContact(self: Collider2D, other: Collider2D, contact: IPhysics2DContact | null) {
        if (!contact) return;

        // 检测是否是有效的地面接触
        if (this.isValidGroundNormal(contact, self)) {
            this.groundContactSet.add(other.uuid); // 记录这个地面物体
            
            // 落地瞬间重置状态
            this.canDash = true; 
            this.coyoteTimer = 0; // 在地面上时不需要土狼时间
            console.log('[Debug] Grounded');
        }
    }

    private onEndContact(self: Collider2D, other: Collider2D, contact: IPhysics2DContact | null) {
        // 移除离开的物体
        if (this.groundContactSet.has(other.uuid)) {
            this.groundContactSet.delete(other.uuid);

            // 如果移除后 Set 为空，说明完全离开了地面（悬空）
            if (this.groundContactSet.size === 0) {
                // 【核心】开启土狼时间
                // 只有在非冲刺状态下才开启，防止冲刺结束瞬间触发奇怪的土狼时间（视设计而定）
                if (!this.isDashing) {
                    this.coyoteTimer = this.coyoteTime;
                }
            }
        }
    }
}