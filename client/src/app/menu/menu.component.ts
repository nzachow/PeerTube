import { Component, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { UserRight } from '../../../../shared/models/users/user-right.enum'
import { AuthService, AuthStatus, ServerService } from '../core'
import { User } from '../shared/users/user.model'

@Component({
  selector: 'my-menu',
  templateUrl: './menu.component.html',
  styleUrls: [ './menu.component.scss' ]
})
export class MenuComponent implements OnInit {
  user: User
  isLoggedIn: boolean
  userHasAdminAccess = false

  private routesPerRight = {
    [UserRight.MANAGE_USERS]: '/admin/users',
    [UserRight.MANAGE_SERVER_FOLLOW]: '/admin/friends',
    [UserRight.MANAGE_VIDEO_ABUSES]: '/admin/video-abuses',
    [UserRight.MANAGE_VIDEO_BLACKLIST]: '/admin/video-blacklist'
  }

  constructor (
    private authService: AuthService,
    private serverService: ServerService,
    private router: Router
  ) {}

  ngOnInit () {
    this.isLoggedIn = this.authService.isLoggedIn()
    if (this.isLoggedIn === true) this.user = this.authService.getUser()
    this.computeIsUserHasAdminAccess()

    this.authService.loginChangedSource.subscribe(
      status => {
        if (status === AuthStatus.LoggedIn) {
          this.isLoggedIn = true
          this.user = this.authService.getUser()
          this.computeIsUserHasAdminAccess()
          console.log('Logged in.')
        } else if (status === AuthStatus.LoggedOut) {
          this.isLoggedIn = false
          this.user = undefined
          this.computeIsUserHasAdminAccess()
          console.log('Logged out.')
        } else {
          console.error('Unknown auth status: ' + status)
        }
      }
    )
  }

  isRegistrationAllowed () {
    return this.serverService.getConfig().signup.allowed
  }

  getFirstAdminRightAvailable () {
    const user = this.authService.getUser()
    if (!user) return undefined

    const adminRights = [
      UserRight.MANAGE_USERS,
      UserRight.MANAGE_SERVER_FOLLOW,
      UserRight.MANAGE_VIDEO_ABUSES,
      UserRight.MANAGE_VIDEO_BLACKLIST
    ]

    for (const adminRight of adminRights) {
      if (user.hasRight(adminRight)) {
        return adminRight
      }
    }

    return undefined
  }

  getFirstAdminRouteAvailable () {
    const right = this.getFirstAdminRightAvailable()

    return this.routesPerRight[right]
  }

  logout (event: Event) {
    event.preventDefault()

    this.authService.logout()
    // Redirect to home page
    this.router.navigate(['/videos/list'])
  }

  private computeIsUserHasAdminAccess () {
    const right = this.getFirstAdminRightAvailable()

    this.userHasAdminAccess = right !== undefined
  }
}