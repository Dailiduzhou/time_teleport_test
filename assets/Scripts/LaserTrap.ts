import { _decorator, Component, Node, BoxCollider2D, UIOpacity } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('LaserTrap')
export class LaserTrap extends Component {

    @property(Node)
    visualNode: Node = null;      // 激光/火焰显示

    @property(BoxCollider2D)
    hitCollider: BoxCollider2D = null;

    @property
    activeTime: number = 1.5;     // 开启时间

    @property
    inactiveTime: number = 1.5;   // 关闭时间

    private isActive: boolean = false;

    start () {
        this.turnOff();
        this.scheduleOnce(this.turnOn, this.inactiveTime);
    }

    private turnOn = () => {
        this.isActive = true;

        this.hitCollider.enabled = true;

        const opacity = this.visualNode.getComponent(UIOpacity);
        if (opacity) opacity.opacity = 255;

        this.scheduleOnce(this.turnOff, this.activeTime);
    }

    private turnOff = () => {
        this.isActive = false;

        this.hitCollider.enabled = false;

        const opacity = this.visualNode.getComponent(UIOpacity);
        if (opacity) opacity.opacity = 0;

        this.scheduleOnce(this.turnOn, this.inactiveTime);
    }
}


