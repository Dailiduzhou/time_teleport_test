import { _decorator, Component, Node, input, Input, KeyCode, EventKeyboard, RigidBody2D, Vec2, Collider2D, Contact2DType, IPhysics2DContact, Vec3, PhysicsSystem2D, BoxCollider2D } from 'cc';
import { TimeTravelManager } from './TimeTravelManager';
const { ccclass, property } = _decorator;

const GROUP_PLAYER_PAST   = 1 << 1; // 2
const GROUP_PLAYER_FUTURE = 1 << 2; // 4
const GROUP_PAST_WALL     = 1 << 3; // 8
const GROUP_FUTURE_WALL   = 1 << 4; // 16

@ccclass('PlayerController')
export class PlayerController extends Component {
    @property({ tooltip: '移动速度' })
    moveSpeed: number = 10;

    @property({ tooltip: '跳跃力度' })
    jumpForce: number = 20;

    @property({ tooltip: '土狼时间（秒）：离开平台后多少秒内仍可跳跃' })
    coyoteTimeDuration: number = 0.1;

    @property(TimeTravelManager)
    timeTravelManager: TimeTravelManager = null;
    // 内部状态
    private rigidBody: RigidBody2D = null;
    private collider: Collider2D = null;
    
    // 移动输入状态 (-1, 0, 1)
    private horizontalInput: number = 0;
    
    // 土狼时间计时器
    private coyoteTimer: number = 0;
    
    // 是否在地面
    private isGrounded: boolean = false;

    onLoad() {
        this.rigidBody = this.getComponent(RigidBody2D);
        this.collider = this.getComponent(Collider2D);

        // 注册物理碰撞回调（用于检测地面）
        if (this.collider) {
            this.collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            this.collider.on(Contact2DType.END_CONTACT, this.onEndContact, this);
        }

        // 注册按键监听
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);

        if (!this.timeTravelManager) {
            console.warn("未绑定 TimeTravelManager");
        }

    }

    start() {
        // ...
        console.log(`【PlayerDebug】正在初始化脚本，当前节点名: <${this.node.name}>`);

        const collider = this.getComponent(BoxCollider2D);
        if (collider) {
            collider.group = GROUP_PLAYER_PAST;
            collider.apply();
        }
        
        if (!collider) {
            console.error(`【严重错误】节点 <${this.node.name}> 上挂了 PlayerController，但是没有 BoxCollider2D！请检查 Inspector 面板。`);
            return; // 强行停止，防止红字刷屏
        }

        console.log("player sensor:", collider.sensor);

        console.log(`【PlayerDebug】玩家初始分组: ${collider.group} (二进制: ${collider.group.toString(2)})`);
        
        // const mapNode = this.mapManager.tiledMap.node;
        // this.node.setParent(mapNode);
        // // this.node.setPosition(-200, 200, 0);
        // this.node.setPosition(-200, 200, 0);
        // console.log("Player world:", this.node.worldPosition);

        // console.log("Body type:", this.rigidBody.type, "gravity:", this.rigidBody.gravityScale);
    }

    onDestroy() {
        if (this.collider) {
            this.collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            this.collider.off(Contact2DType.END_CONTACT, this.onEndContact, this);
        }
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    update(deltaTime: number) {
        // 1. 处理土狼时间计时
        if (this.coyoteTimer > 0) {
            this.coyoteTimer -= deltaTime;
        }

        // 2. 执行移动逻辑
        this.applyMovement();
    }

    private onKeyDown(event: EventKeyboard) {
        switch (event.keyCode) {
            // --- 移动 (A/D) ---
            case KeyCode.KEY_A:
                this.horizontalInput = -1;
                this.node.setScale(new Vec3(-1, 1, 1)); // 简单的角色翻转
                break;
            case KeyCode.KEY_D:
                this.horizontalInput = 1;
                this.node.setScale(new Vec3(1, 1, 1));
                break;

            // --- 跳跃 (J) ---
            case KeyCode.KEY_J:
                this.tryJump();
                break;

            case KeyCode.SHIFT_LEFT:
                this.timeTravelManager.tryTimeTravel();
                break;
        }
    }

    private onKeyUp(event: EventKeyboard) {
        // 处理抬起按键停止移动
        if (event.keyCode === KeyCode.KEY_A && this.horizontalInput === -1) {
            this.horizontalInput = 0;
        } else if (event.keyCode === KeyCode.KEY_D && this.horizontalInput === 1) {
            this.horizontalInput = 0;
        }
    }

    private applyMovement() {
        if (!this.rigidBody) return;

        // 获取当前速度
        const velocity = this.rigidBody.linearVelocity;
        
        // 修改 X 轴速度，保持 Y 轴速度不变（受重力影响）
        // 这种方式比 addForce 响应更灵敏，适合平台跳跃
        this.rigidBody.linearVelocity = new Vec2(this.horizontalInput * this.moveSpeed, velocity.y);
    }

    private tryJump() {
        // 跳跃判定：在地面 OR 在土狼时间内
        if (this.isGrounded || this.coyoteTimer > 0) {
            const velocity = this.rigidBody.linearVelocity;
            
            // 直接设置向上的速度
            this.rigidBody.linearVelocity = new Vec2(velocity.x, this.jumpForce);

            // 重要：跳跃后立即消耗掉土狼时间，防止连跳
            this.coyoteTimer = 0;
            this.isGrounded = false; 
        }
    }

    // private useItem() {
    //     console.log("使用了道具！");
    //     // 在这里添加道具逻辑，例如发射子弹、补血等
    // }

    // --- 碰撞检测部分 ---

    private onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact) {
        // 简单判定：只要碰到刚体就认为是着地
        // 进阶做法：判断法线方向 contact.getWorldManifold().normal.y > 0
        this.isGrounded = true;
        this.coyoteTimer = 0; // 在地面上时不需要计时
    }

    private onEndContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact) {
        this.isGrounded = false;
        
        // 核心：离开地面瞬间，开启土狼时间
        // 只有当不是因为"跳跃"导致的离地时，才给满土狼时间其实更好
        // 但简单处理的话，只要离开地面就给时间，然后在 tryJump 里清零即可
        const velocity = this.rigidBody.linearVelocity;
        if (velocity.y <= 0) { 
            // 只有当前速度不是向上（即不是刚起跳）时，才给予土狼时间
            // 这样防止玩家跳跃瞬间因为脱离地面又触发一次土狼判定
            this.coyoteTimer = this.coyoteTimeDuration;
        } else {
            this.coyoteTimer = 0;
        }
    }
}